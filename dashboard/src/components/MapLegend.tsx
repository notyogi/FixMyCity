import React, { useState } from 'react';
import { SEVERITY_ORDER, SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/severity';

export const MapLegend: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-6 left-6 z-[1000] max-w-xs transition-all duration-200">
      <div className="bg-white/95 backdrop-blur-xs border border-gray-200/90 shadow-md rounded-xl p-3.5 text-xs text-gray-800">
        <div className="flex items-center justify-between font-semibold pb-1.5 border-b border-gray-100 mb-2">
          <span className="flex items-center space-x-1.5 text-gray-900 font-bold tracking-tight">
            <span>Map Legend</span>
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-gray-700 text-xs px-1 py-0.5 rounded focus:outline-none"
            title={collapsed ? 'Expand legend' : 'Collapse legend'}
          >
            {collapsed ? '▲ Expand' : '▼ Hide'}
          </button>
        </div>

        {!collapsed && (
          <div className="space-y-2.5">
            {/* Severity Colors & Labels */}
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Severity Level
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {SEVERITY_ORDER.map((sev) => (
                  <div key={sev} className="flex items-center space-x-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-2xs flex-shrink-0"
                      style={{ backgroundColor: SEVERITY_COLORS[sev] }}
                    />
                    <span className="text-gray-700 font-medium">
                      {SEVERITY_LABELS[sev]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Special Rings & Flags */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Location Risk Flag
              </p>
              <div className="flex items-center space-x-2">
                <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <span className="absolute w-5 h-5 rounded-full border border-dashed border-purple-600"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                </div>
                <span className="text-gray-600 text-2xs leading-tight">
                  Near school, hospital, or sensitive area (dashed ring)
                </span>
              </div>
            </div>

            {/* Marker Radius / Confirmation scaling explanation */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Marker Size
              </p>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                  <span className="text-gray-300">→</span>
                  <span className="w-4 h-4 rounded-full bg-gray-600"></span>
                </div>
                <span className="text-gray-600 text-2xs leading-tight">
                  Scales with citizen confirmations (10px–24px)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

