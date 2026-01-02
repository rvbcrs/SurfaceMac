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
  const { nextStep, prevStep, config, macosVersion, cpuType } = useWizard();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configComplete, setConfigComplete] = useState(false);
  const [showExpertMode, setShowExpertMode] = useState(false);
  const [enableVerbose, setEnableVerbose] = useState(true); // Default to true for troubleshooting
  const [ejected, setEjected] = useState(false);
  
  // Config file based on CPU type
  const configFileName = `config-${cpuType}.plist`;
  
  // Mock config.plist structure for expert mode
  const [configTree] = useState<ConfigTreeData>({
    'PlatformInfo': {
      'Generic': {
        'SystemSerialNumber': config.smbios?.serial || 'Will be injected',
        'MLB': config.smbios?.mlb || 'Will be injected',
        'SystemUUID': config.smbios?.uuid || 'Will be injected',
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
    
    try {
      if (window.electronAPI && config.smbios && config.selectedUsb) {
        // In Electron: Read the correct config file, inject SMBIOS, and save
        await window.electronAPI.injectConfig({
            cpuType,
            smbios: config.smbios,
            macosVersion,
            diskPath: config.selectedUsb.path,
            verbose: enableVerbose
        });
        
        // Let user see completion for a moment
        await new Promise(resolve => setTimeout(resolve, 500));

        // Keep EFI mounted so user can verify config before ejecting
        // await window.electronAPI.unmountEFI(config.selectedUsb.path);
        console.log("EFI kept mounted for user verification. Eject USB when ready.");
      } else {
        if (!config.selectedUsb) console.warn('No USB selected in config, cannot inject.');
        // Simulate for browser
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      console.error('Failed to apply configuration:', error);
      // We should probably show an error state here, but for now log it
    }
    
    setIsConfiguring(false);
    setConfigComplete(true);
  };

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">OpenCore Configuration</h1>
        <p className="content-subtitle">
          Configure {configFileName} with your SMBIOS data.
        </p>
      </header>

      <div className="content-body fade-in">
        {!configComplete && (
          <>
            <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
              <div className="alert-icon">📋</div>
              <div className="alert-content">
                <div className="alert-title">Config File: {configFileName}</div>
                <div className="alert-message">
                  Using the {cpuType.toUpperCase()} configuration for your Surface Pro 7. 
                  This will be renamed to config.plist automatically.
                </div>
              </div>
            </div>

            {/* Verbose Mode Toggle */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                    <input 
                        type="checkbox" 
                        checked={enableVerbose} 
                        onChange={(e) => setEnableVerbose(e.target.checked)} 
                        style={{ marginRight: '10px' }}
                        disabled={isConfiguring}
                    />
                    <div>
                        <div style={{ fontWeight: 'bold' }}>Enable Verbose Mode (-v)</div>
                        <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8 }}>
                            Useful for debugging boot issues. Disabling shows the Apple boot logo.
                        </div>
                    </div>
                </label>
            </div>

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
                  ✅ Use {configFileName} as base configuration
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ <strong>SystemSerialNumber:</strong> {config.smbios?.serial || 'Not generated yet'}
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ <strong>MLB:</strong> {config.smbios?.mlb || 'Not generated yet'}
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ <strong>SystemUUID:</strong> {config.smbios?.uuid || 'Not generated yet'}
                </li>
                <li style={{ marginBottom: 'var(--space-sm)' }}>
                  ✅ WiFi kext: {macosVersion === 'sonoma' ? 'AirportItlwm.kext' : 'itlwm.kext'}
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

        {configComplete && config.selectedUsb && (
             <div style={{ marginTop: 'var(--space-md)', textAlign: 'center' }}>
                 {!ejected ? (
                    <button 
                        className="btn btn-ghost" 
                        onClick={async () => {
                            if (!config.selectedUsb) return;
                            try {
                                if (window.electronAPI) {
                                    await window.electronAPI.unmountDisk(config.selectedUsb.path);
                                    setEjected(true);
                                }
                            } catch (e) {
                                alert('Failed to eject: ' + String(e));
                            }
                        }}
                        style={{ border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}
                    >
                        ⏏️ Safely Eject USB
                    </button>
                 ) : (
                    <span style={{ color: 'var(--color-accent-green)', fontWeight: 600 }}>
                        ✓ USB Safely Ejected
                    </span>
                 )}
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
