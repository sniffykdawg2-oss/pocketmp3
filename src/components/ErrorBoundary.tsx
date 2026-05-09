import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  message?: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "PocketMP3 could not load." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (this.state.message) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#05070c] p-6 text-white">
          <div className="glass max-w-sm rounded-3xl p-5">
            <p className="text-sm font-black uppercase text-red-200">PocketMP3 crashed</p>
            <h1 className="mt-3 text-2xl font-black">Refresh the page</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">{this.state.message}</p>
            <button className="mt-5 h-12 w-full rounded-2xl bg-white font-black text-black" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
