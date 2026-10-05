// Vital ingestion: validate -> idempotent insert -> device status -> queue risk analysis -> real-time events.
import { SOCKET_EVENTS } from '@homecare/shared';
import { withTransaction } from '../db/pool.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { enqueue } from '../lib/queue.js';
import { emit } from '../lib/socket.js';
import { formatZod } from '../middleware/validate.js';
import { deviceRepository } from '../repositories/deviceRepository.js';
import { vitalRepository } from '../repositories/vitalRepository.js';
import { vitalReadingSchema } from '../validators/schemas.js';
import { alertService, publish } from './alertService.js';
import { audit } from './auditService.js';

/**
 * Accepts a single reading or `{ readings: [...] }` (the simulator's buffered upload).
 * Idempotent: re-sending the same (device_id, sequence_number) never creates a duplicate row.
 * Optimized: batches execute inside a single atomic database transaction rather than N sequential transactions.
 */
export async function ingest(body, ctx) {
  const started = Date.now();
  const batch = Array.isArray(body?.readings);
  const items = batch ? body.readings : [body];
  if (!items.length) throw badRequest('No readings provided');

  const deviceCache = new Map();
  const prepared = [];

  // Phase 1: in-memory schema validation & device authorization
  for (const raw of items) {
    const parsed = vitalReadingSchema.safeParse(raw);
    if (!parsed.success) {
      prepared.push({ status: 'rejected', errors: formatZod(parsed.error), sequence_number: raw?.sequence_number });
      continue;
    }
    const r = parsed.data;
    let device = deviceCache.get(r.device_id);
    if (device === undefined) {
      device = await deviceRepository.findByUid(r.device_id);
      deviceCache.set(r.device_id, device);
    }
    if (!device) {
      prepared.push({ status: 'rejected', errors: [{ field: 'device_id', message: 'Unknown device' }], sequence_number: r.sequence_number });
      continue;
    }
    if (device.patient_id !== r.patient_id) {
      prepared.push({ status: 'rejected', errors: [{ field: 'patient_id', message: 'Device is not assigned to this patient' }], sequence_number: r.sequence_number });
      continue;
    }
    prepared.push({ status: 'valid', data: r, device });
  }

  // Phase 2: Atomic single-transaction database persistence
  const results = await withTransaction(async (client) => {
    const outcome = [];
    const maxSeqByDevice = new Map();

    for (const item of prepared) {
      if (item.status !== 'valid') {
        outcome.push(item);
        continue;
      }
      const { data: r, device } = item;
      const reading = await vitalRepository.insert(client, { ...r, device_db_id: device.id });
      if (!reading) {
        outcome.push({ status: 'duplicate', sequence_number: r.sequence_number, device });
        continue;
      }
      const prev = maxSeqByDevice.get(device.id);
      if (!prev || r.sequence_number > prev.seq) {
        maxSeqByDevice.set(device.id, { device, seq: r.sequence_number });
      }
      outcome.push({ status: 'created', reading, device, reconnected: false });
    }

    // Update device state once per device in the batch
    for (const [deviceId, { device, seq }] of maxSeqByDevice.entries()) {
      const previousStatus = await deviceRepository.markSeen(client, deviceId, seq);
      if (previousStatus === 'OFFLINE') {
        await deviceRepository.insertEvent(client, { deviceId, patientId: device.patient_id, type: 'ONLINE' });
        for (const res of outcome) {
          if (res.status === 'created' && res.device.id === deviceId) {
            res.reconnected = true;
          }
        }
      }
    }
    return outcome;
  });

  const created = results.filter((r) => r.status === 'created');
  const summary = {
    received: items.length,
    created: created.length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    rejected: results.filter((r) => r.status === 'rejected').length,
  };

  // Per device: reconnection, buffered sync, real-time events.
  const byDevice = new Map();
  for (const r of created) {
    const entry = byDevice.get(r.device.id) || { device: r.device, readings: [], reconnected: false };
    entry.readings.push(r.reading);
    entry.reconnected ||= r.reconnected;
    byDevice.set(r.device.id, entry);
  }

  for (const { device, readings, reconnected } of byDevice.values()) {
    const buffered = readings.filter((r) => r.source === 'BUFFERED');
    if (reconnected) {
      await withTransaction((client) =>
        alertService.autoResolveDevice(client, device.patient_id, 'Device back online - buffered readings synchronised'))
        .then((alert) => alert && publish([[SOCKET_EVENTS.ALERT_UPDATED, alert, 'resolved']]));
      emit(SOCKET_EVENTS.DEVICE_STATUS, { patientId: device.patient_id, deviceUid: device.device_uid, status: 'ONLINE' });
      logger.info({ event_type: 'SENSOR_ONLINE', patient_id: device.patient_id, device: device.device_uid });
    }
    if (buffered.length) {
      const details = { count: buffered.length, from: buffered[0].timestamp, to: buffered.at(-1).timestamp };
      await withTransaction((client) => deviceRepository.insertEvent(client, {
        deviceId: device.id, patientId: device.patient_id, type: 'BUFFER_SYNC', details,
      }));
      await audit(ctx, 'BUFFERED_READINGS_SYNCED', 'sensor_device', device.device_uid, { patientId: device.patient_id, ...details });
      logger.info({ event_type: 'BUFFERED_READING_SYNCED', request_id: ctx.requestId, patient_id: device.patient_id, ...details });
      emit(SOCKET_EVENTS.DEVICE_SYNCED, { patientId: device.patient_id, deviceUid: device.device_uid, ...details });
    }
    const live = readings.filter((r) => r.source !== 'BUFFERED');
    for (const reading of live.slice(-5)) emit(SOCKET_EVENTS.VITAL_NEW, reading);
    logger.info({
      event_type: 'VITAL_RECEIVED', request_id: ctx.requestId, patient_id: device.patient_id,
      count: readings.length, processing_time_ms: Date.now() - started,
    });
    // Risk is analysed once per patient per request, on the newest data.
    await enqueue('risk:assess', { patientId: device.patient_id, requestId: ctx.requestId }, { key: device.patient_id });
  }

  await audit(ctx, 'VITALS_INGESTED', 'vital_readings', null, { ...summary, batch });

  if (!batch) {
    const only = results[0];
    if (only.status === 'rejected') throw badRequest('Invalid vital reading', only.errors);
    return { status: only.status, reading: only.reading || null };
  }
  return { ...summary, results: results.map(({ status, sequence_number, errors }) => ({ status, sequence_number, errors })) };
}

export const vitalService = {
  ingest,
  listForPatient: (patientId, opts) => vitalRepository.listForPatient(patientId, opts),
};
