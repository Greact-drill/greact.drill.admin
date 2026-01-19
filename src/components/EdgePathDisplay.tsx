import React from 'react';
import type { Edge } from '../api/admin';

interface EdgePathDisplayProps {
  edgePath: Edge[];
}

const EdgePathDisplay: React.FC<EdgePathDisplayProps> = ({ edgePath }) => {
  if (!edgePath || edgePath.length === 0) {
    return null;
  }

  return (
    <div className="edge-path-display">
      <div className="path-label">Текущий элемент:</div>
      <div className="path-breadcrumbs">
        {edgePath.map((edge, index) => (
          <React.Fragment key={edge.id}>
            <span className="edge-name">
              {edge.name}
            </span>
            {index < edgePath.length - 1 && (
              <i className="pi pi-angle-right path-separator"></i>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="path-info">
        <small>ID: {edgePath[edgePath.length - 1].id}</small>
        {edgePath.length > 1 && (
          <small className="ml-3">
            Уровень вложенности: {edgePath.length - 1}
          </small>
        )}
      </div>
    </div>
  );
};

export default EdgePathDisplay;