import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          Something went wrong. Refresh the page and try again.
        </div>
      );
    }

    return this.props.children;
  }
}
