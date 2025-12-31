import { useState } from 'react';
import { useWizard } from '../App';

interface ConfigTreeData {
  [key: string]: ConfigTreeData | string | Array<{ BundlePath: string }>;
}

interface ConfigNodeProps {
  data: ConfigTreeData | string | Array<{ BundlePath: string }>;
  depth: number;
}

const ConfigStep: React.FC = () => {
  const { nextStep, prevStep, config, macosVersion } = useWizard();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configComplete, setConfigComplete] = useState(false);
  const [showExpertMode, setShowExpertMode] = useState(false);
  
  // Mock config.plist structure for expert mode
  const [configTree] = useState<ConfigTreeData>({
    'PlatformInfo': {
      'Generic': {
        'SystemSerialNumber': config.smbios?.serial || 'Not set',
        'MLB': config.smbios?.mlb || 'Not set',
        'SystemUUID': config.smbios?.uuid || 'Not set',
        'SystemProductName': 'MacBookAir9,1',
      },
    },
    'Kernel': {
      'Add': [
        { 'BundlePath': macosVersion === 'sonoma' ? 'AirportItlwm.kext' : 'itlwm.kext' },
        { 'BundlePath': 'Lilu.kext' },
        { 'BundlePath': 'VirtualSMC.kext' },
        { 'BundlePath': 'WhateverGreen.kext' },
      ],
    },
    'NVRAM': {
      'Add': {
        '7C436110-AB2A-4BBB-A880-FE41995C9F82': {
          'boot-args': '-v keepsyms=1',
        },
      },
    },
  });

  const applyConfiguration = async (): Promise<void> => {
    setIsConfiguring(true);
    
    // Simulate config update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In real implementation:
    // if (window.electronAPI && config.efiPath) {
    //   await window.electronAPI.writeConfig(config.efiPath + '/EFI/OC/config.plist', configTree as ConfigPlist);
    // }
    
    setIsConfiguring(false);
    setConfigComplete(true);
  };

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">OpenCore Configuration</h1>
        <p className="content-subtitle">
          Configure config.plist with your SMBIOS data and WiFi drivers.
        </p>
      </header>

      <div className="content-body fade-in">
        {!configComplete && (
          <>
            <div className="card">
              <div className="card-header">
                <div className="card-icon">⚙️</div>
                <div>
                  <div className="card-title">Configuration Summary</div>
                </div>
              </div>
              <div className="card-description">
                The following changes will be made to your config.plist:
              </div>
              <ul style={{ marginTop: 'var(--space-md)', marginLeft: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ SMBIOS data (Serial, MLB, UUID) injected
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ WiFi kext configured: {macosVersion === 'sonoma' ? 'AirportItlwm.kext' : 'itlwm.kext'}
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ Model set to MacBookAir9,1 (Ice Lake)
                </li>
              </ul>
            </div>

            <div style={{ marginTop: 'var(--space-xl)' }}>
              <button 
                className="btn btn-ghost"
                onClick={() => setShowExpertMode(!showExpertMode)}
              >
                {showExpertMode ? '🔽 Hide' : '🔧 Show'} Expert Mode
              </button>
            </div>

            {showExpertMode && (
              <div className="config-editor" style={{ marginTop: 'var(--space-md)' }}>
                <div className="config-tree">
                  <ConfigNode data={configTree} depth={0} />
                </div>
              </div>
            )}

            {!isConfiguring && (
              <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
                <button className="btn btn-primary" onClick={applyConfiguration}>
                  Apply Configuration
                </button>
              </div>
            )}

            {isConfiguring && (
              <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
                <p style={{ color: 'var(--color-text-muted)' }}>Updating config.plist...</p>
              </div>
            )}
          </>
        )}

        {configComplete && (
          <div className="alert alert-success">
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">Configuration Complete</div>
              <div className="alert-message">
                Your config.plist has been updated with your SMBIOS data and WiFi drivers.
                Next, we'll guide you through the BIOS/UEFI settings.
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="content-footer">
        <button className="btn btn-secondary" onClick={prevStep} disabled={isConfiguring}>
          ← Back
        </button>
        <button 
          className="btn btn-primary" 
          onClick={nextStep}
          disabled={!configComplete}
        >
          Next →
        </button>
      </footer>
    </>
  );
};

// Simple config tree renderer for expert mode
const ConfigNode: React.FC<ConfigNodeProps> = ({ data, depth }) => {
  if (typeof data !== 'object' || data === null) {
    return <span className="config-value">{JSON.stringify(data)}</span>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="config-node">
        {data.map((item, i) => (
          <div key={i} style={{ marginLeft: depth * 16 }}>
            <span className="config-key">[{i}]</span>: <ConfigNode data={item as ConfigTreeData} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="config-node">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4 }}>
          <span className="config-key">{key}</span>: <ConfigNode data={value as ConfigTreeData} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
};

export default ConfigStep;
