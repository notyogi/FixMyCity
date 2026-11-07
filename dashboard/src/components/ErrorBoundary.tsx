import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-red-50 border-2 border-red-300 rounded-2xl text-red-900 space-y-4 shadow-xl">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h2 className="text-base font-bold text-red-900">Application Rendering Error</h2>
              <p className="text-xs text-red-700">A component encountered an unhandled exception:</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-200 font-mono text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
            {this.state.error?.toString()}
          </div>
          {this.state.errorInfo?.componentStack && (
            <div className="bg-red-100/60 p-4 rounded-xl font-mono text-2xs text-red-900 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
              {this.state.errorInfo.componentStack}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Reset Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
