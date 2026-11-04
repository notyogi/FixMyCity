import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { StatusBanner } from './StatusBanner';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans antialiased text-gray-900">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo & Title */}
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-xs">
                F
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:space-x-2">
                <span className="text-lg font-bold text-gray-900 tracking-tight">
                  FixMyCity
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 self-start sm:self-auto">
                  Municipal Admin
                </span>
              </div>
            </div>

            {/* User Session & Logout */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {user?.email && (
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs text-gray-500 font-medium">Logged in as</span>
                  <span className="text-sm font-semibold text-gray-700 truncate max-w-[200px] md:max-w-[280px]">
                    {user.email}
                  </span>
                </div>
              )}

              <button
                onClick={() => signOut()}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition shadow-2xs cursor-pointer"
                title="Log out of municipal session"
              >
                <svg
                  className="w-4 h-4 mr-1.5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Global Status / Cold-Start Alert Banner */}
      <StatusBanner />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      {/* Civic Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        FixMyCity Municipal Operations Platform &bull; Authorized Personnel Only
      </footer>
    </div>
  );
};

