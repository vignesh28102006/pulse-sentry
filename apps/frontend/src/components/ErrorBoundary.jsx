import { Component } from 'react';

/**
 * Clinical ErrorBoundary: ensures rendering errors in charts, live telemetry,
 * or data parsers never crash the entire application into a blank screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('PulseSentry UI Runtime Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="card max-w-lg border-red-200 bg-red-50/50 p-6 shadow-md">
            <div className="flex items-center gap-3 text-red-700">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-red-100 text-xl font-bold">⚠</span>
              <div>
                <h2 className="text-lg font-bold">Clinical View Error Caught</h2>
                <p className="text-xs text-red-600">Patient telemetry ingestion continues safely in the backend.</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-700">
              An unexpected interface error prevented this section from rendering. You can safely retry or reload the page.
            </p>

            {this.state.error && (
              <details className="mt-3 rounded border border-red-200 bg-white p-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-medium text-red-800">Technical Details</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-slate-800">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={this.handleReset}
              >
                Retry Component
              </button>
              <button
                type="button"
                className="btn text-sm"
                onClick={() => window.location.reload()}
              >
                Reload Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
