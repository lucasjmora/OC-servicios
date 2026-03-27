import React from 'react';

const PageHeader = ({ title, subtitle, action }) => {
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
};

export default PageHeader;



