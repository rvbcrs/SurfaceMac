import { useWizard } from '../App';

const WelcomeStep: React.FC = () => {
  const { nextStep, macosVersion, setMacosVersion, cpuType, setCpuType, cpuDetected, platform, config, updateConfig } = useWizard();

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">Welcome to SurfaceMac</h1>
        <p className="content-subtitle">
          Install macOS on your Microsoft Surface Pro 7 with ease.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="alert alert-info">
          <div className="alert-icon">ℹ️</div>
          <div className="alert-content">
            <div className="alert-title">Before You Begin</div>
            <div className="alert-message">
              Make sure you have a USB drive (16GB+) and backup any important data.
              {platform === 'win32' && ' WiFi will be required during macOS installation.'}
            </div>
          </div>
        </div>

        {/* CPU Selection */}
        <h2 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-xl)' }}>
          Select your Surface Pro 7 CPU
          {cpuDetected && <span style={{ color: 'var(--color-accent-green)', fontSize: 'var(--font-size-sm)', marginLeft: 'var(--space-sm)' }}>✓ Auto-detected</span>}
        </h2>

        <div className="version-grid" style={{ marginBottom: 'var(--space-xl)' }}>
          <div 
            className={`card ${cpuType === 'i5' ? 'card-selected' : ''}`}
            onClick={() => setCpuType('i5')}
            style={{ cursor: 'pointer' }}
          >
            <div className="card-header">
              <div className="card-icon">💻</div>
              <div>
                <div className="card-title">Intel Core i5</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  i5-1035G4
                </div>
              </div>
            </div>
            <div className="card-description">
              Uses config-i5.plist
            </div>
          </div>

          <div 
            className={`card ${cpuType === 'i7' ? 'card-selected' : ''}`}
            onClick={() => setCpuType('i7')}
            style={{ cursor: 'pointer' }}
          >
            <div className="card-header">
              <div className="card-icon">⚡</div>
              <div>
                <div className="card-title">Intel Core i7</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  i7-1065G7
                </div>
              </div>
            </div>
            <div className="card-description">
              Uses config-i7.plist
            </div>
          </div>
        </div>

        <h2 style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-lg)' }}>
          Choose your macOS version
        </h2>


        <div className="version-grid">
          <div 
            className={`card version-card ${macosVersion === 'sonoma' ? 'card-selected' : ''}`}
            onClick={() => setMacosVersion('sonoma')}
          >
            <span className="card-badge badge-recommended">Recommended</span>
            <div className="card-header">
              <div className="card-icon">🏔️</div>
              <div>
                <div className="card-title">macOS Sonoma</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  Version 14.7.2
                </div>
              </div>
            </div>
            <div className="card-description">
              <strong>Best stability and WiFi support.</strong>
              <br /><br />
              Uses AirportItlwm.kext for native WiFi menu integration. 
              This is the most tested and reliable option for Surface Pro 7.
            </div>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 'var(--space-xs)',
                color: 'var(--color-accent-green)',
                fontSize: 'var(--font-size-sm)'
              }}>
                ✓ Native WiFi menu
              </span>
            </div>
          </div>

          <div 
            className={`card version-card ${macosVersion === 'sequoia' ? 'card-selected' : ''}`}
            onClick={() => setMacosVersion('sequoia')}
          >
            <span className="card-badge badge-experimental">Experimental</span>
            <div className="card-header">
              <div className="card-icon">🌲</div>
              <div>
                <div className="card-title">macOS Sequoia</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  Version 15.x
                </div>
              </div>
            </div>
            <div className="card-description">
              <strong>Latest features, different WiFi setup.</strong>
              <br /><br />
              Apple removed the legacy WiFi stack. Uses itlwm.kext + HeliPort app 
              instead of the native WiFi menu.
            </div>
            <div style={{ marginTop: 'var(--space-md)' }}>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 'var(--space-xs)',
                color: 'var(--color-accent-orange)',
                fontSize: 'var(--font-size-sm)'
              }}>
                ⚠️ HeliPort app required
              </span>
            </div>
          </div>
        </div>

        {macosVersion === 'sequoia' && (
          <div className="alert alert-warning" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">⚠️</div>
            <div className="alert-content">
              <div className="alert-title">Sequoia WiFi Notice</div>
              <div className="alert-message">
                WiFi on Sequoia requires the HeliPort app. You'll need to connect to WiFi 
                through this separate app instead of the macOS menu bar. 
                The wizard will install HeliPort automatically during post-install.
              </div>
            </div>
          </div>
        )}

        {/* Advanced Options */}
        <details style={{ marginTop: 'var(--space-xl)' }}>
          <summary style={{ 
            cursor: 'pointer', 
            color: 'var(--color-text-muted)', 
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-md)'
          }}>
            ⚙️ Advanced Options
          </summary>
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <div className="card-icon">📦</div>
              <div>
                <div className="card-title">EFI Source</div>
              </div>
            </div>
            <div className="card-description">
              By default, we use the official Surface Pro 7 EFI from GitHub. 
              You can specify a custom URL or select a local zip file.
            </div>
            <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="efiSource" 
                  checked={config.efiSource.type === 'default'} 
                  onChange={() => updateConfig({ efiSource: { type: 'default', value: 'repo:balopez83/Surface-Pro-7-Hackintosh' } })}
                />
                Use default (balopez83/Surface-Pro-7-Hackintosh)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="efiSource" 
                  checked={config.efiSource.type === 'url'} 
                  onChange={() => updateConfig({ efiSource: { type: 'url', value: '' } })}
                />
                Custom URL
              </label>
              {config.efiSource.type === 'url' && (
                <input 
                  type="text" 
                  placeholder="https://github.com/user/repo/archive/main.zip"
                  value={config.efiSource.value}
                  onChange={(e) => updateConfig({ efiSource: { type: 'url', value: e.target.value } })}
                  style={{ 
                    padding: 'var(--space-sm)', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-elevated)',
                    color: 'var(--color-text-primary)',
                    marginLeft: 'var(--space-lg)'
                  }}
                />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="efiSource" 
                  checked={config.efiSource.type === 'local'} 
                  onChange={async () => {
                    if (window.electronAPI) {
                      const path = await window.electronAPI.selectDirectory();
                      if (path) {
                        updateConfig({ efiSource: { type: 'local', value: path } });
                      }
                    } else {
                      updateConfig({ efiSource: { type: 'local', value: '/path/to/EFI' } });
                    }
                  }}
                />
                Use local EFI folder
              </label>
              {config.efiSource.type === 'local' && config.efiSource.value && (
                <div style={{ marginLeft: 'var(--space-lg)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  📁 {config.efiSource.value}
                </div>
              )}
            </div>
          </div>
        </details>
      </div>

      <footer className="content-footer">
        <div></div>
        <button className="btn btn-primary" onClick={nextStep}>
          Get Started →
        </button>
      </footer>
    </>
  );
};

export default WelcomeStep;
