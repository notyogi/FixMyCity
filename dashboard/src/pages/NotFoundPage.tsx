import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <p className="text-sm font-bold text-teal-600 uppercase tracking-widest">404 Error</p>
        <h1 className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 text-base text-gray-500 max-w-md">
          The requested administrative page or resource does not exist in the FixMyCity portal.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-xs text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

