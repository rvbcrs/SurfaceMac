import { useState } from 'react';
import { useWizard } from '../App';

interface InstallStepItem {
  id: number;
  title: string;
  description: string;
  note?: string;
  important?: boolean;
}

const INSTALL_STEPS: InstallStepItem[] = [
  {
    id: 1,
    title: 'Boot from USB',
    description: 'In OpenCore menu, select "macOS Recovery" or "Install macOS Sonoma/Sequoia"',
  },
  {
    id: 2,
    title: 'Open Disk Utility',
    description: 'View → Show All Devices. Select your internal SSD.',
  },
  {
    id: 3,
    title: 'Format SSD',
    description: 'Click Erase. Name: "Macintosh HD", Format: APFS, Scheme: GUID Partition Map',
  },
  {
    id: 4,
    title: 'Close Disk Utility',
    description: 'Select "Reinstall macOS" from the recovery menu.',
  },
  {
    id: 5,
    title: 'Connect to WiFi',
    description: 'Click the WiFi icon (top right) and connect to your network.',
    note: 'Only needed for recovery install. Skip if using full installer.',
  },
  {
    id: 6,
    title: 'Install macOS',
    description: 'Select your formatted SSD and begin installation.',
  },
  {
    id: 7,
    title: 'Wait for Reboots',
    description: 'The system will restart 3-4 times. Always boot from USB until complete.',
    important: true,
  },
];

const InstallStep: React.FC = () => {
  const { nextStep, prevStep, macosVersion, platform } = useWizard();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const toggleStep = (stepId: number): void => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const allComplete = INSTALL_STEPS.every(step => completedSteps.includes(step.id));

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">macOS Installation</h1>
        <p className="content-subtitle">
          Follow these steps to install macOS {macosVersion === 'sonoma' ? 'Sonoma' : 'Sequoia'} on your Surface.
        </p>
      </header>

      <div className="content-body fade-in">
        {platform === 'win32' && (
          <div className="alert alert-info">
            <div className="alert-icon">📶</div>
            <div className="alert-content">
              <div className="alert-title">WiFi Required</div>
              <div className="alert-message">
                Since you created this installer on Windows (recovery method), 
                you'll need a WiFi connection during installation to download ~12GB of files.
              </div>
            </div>
          </div>
        )}

        <ul className="checklist">
          {INSTALL_STEPS.map((step) => (
            <li 
              key={step.id}
              className={`checklist-item ${completedSteps.includes(step.id) ? 'completed' : ''}`}
              onClick={() => toggleStep(step.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="checklist-checkbox">
                {completedSteps.includes(step.id) && '✓'}
              </div>
              <div style={{ flex: 1 }}>
                <div className="checklist-text" style={{ fontWeight: step.important ? 700 : 500 }}>
                  {step.id}. {step.title}
                </div>
                <div style={{ 
                  color: 'var(--color-text-muted)', 
                  fontSize: 'var(--font-size-sm)',
                  marginTop: 'var(--space-xs)'
                }}>
                  {step.description}
                </div>
                {step.note && (
                  <div style={{ 
                    color: 'var(--color-text-muted)', 
                    fontSize: 'var(--font-size-xs)',
                    fontStyle: 'italic',
                    marginTop: 'var(--space-xs)'
                  }}>
                    💡 {step.note}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 'var(--space-xl)' }}>
          <button 
            className="btn btn-ghost"
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
          >
            {showTroubleshooting ? '🔽 Hide' : '🔧 Show'} Troubleshooting Tips
          </button>
        </div>

        {showTroubleshooting && (
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-title" style={{ marginBottom: 'var(--space-md)' }}>
              Common Issues
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Trackpad not working?</strong><br />
                This is normal during installation. Use a USB mouse until post-install.
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>WiFi networks not showing?</strong><br />
                Make sure the AirportItlwm/itlwm kext is in EFI/OC/Kexts and enabled in config.plist.
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Stuck at Apple logo?</strong><br />
                Try adding -v to boot-args for verbose mode. Check for missing kexts.
              </p>
              <p>
                <strong>Installation fails?</strong><br />
                Re-format the SSD as APFS with GUID scheme. Make sure Secure Boot is disabled.
              </p>
            </div>
          </div>
        )}

        {allComplete && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">🎉</div>
            <div className="alert-content">
              <div className="alert-title">macOS Installed!</div>
              <div className="alert-message">
                Congratulations! macOS is now installed. The final step is to copy the 
                bootloader to your internal drive so you can boot without the USB.
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="content-footer">
        <button className="btn btn-secondary" onClick={prevStep}>
          ← Back
        </button>
        <button 
          className="btn btn-primary" 
          onClick={nextStep}
          disabled={!allComplete}
        >
          Next →
        </button>
      </footer>
    </>
  );
};

export default InstallStep;
