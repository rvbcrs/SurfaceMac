import { useState } from 'react';
import { useWizard } from '../App';

interface BiosStepItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  warning?: string;
}

const BIOS_STEPS: BiosStepItem[] = [
  {
    id: 1,
    title: 'Enter UEFI Setup',
    description: 'Power off your Surface. Hold Volume Up + Power to enter UEFI.',
    icon: '🔌',
  },
  {
    id: 2,
    title: 'Disable Secure Boot',
    description: 'Go to Security → Secure Boot → Change Configuration → None',
    icon: '🔓',
    warning: 'You will see a red unlocked padlock at boot. This is normal.',
  },
  {
    id: 3,
    title: 'Set Boot Order',
    description: 'Go to Boot Configuration → Drag "USB Storage" to the top',
    icon: '📋',
  },
  {
    id: 4,
    title: 'Save and Exit',
    description: 'Exit UEFI setup. Your Surface will restart.',
    icon: '💾',
  },
];

const BiosStep: React.FC = () => {
  const { nextStep, prevStep } = useWizard();
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const toggleStep = (stepId: number): void => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const allComplete = BIOS_STEPS.every(step => completedSteps.includes(step.id));

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">UEFI/BIOS Settings</h1>
        <p className="content-subtitle">
          Configure your Surface Pro 7 UEFI settings for macOS boot.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="alert alert-info">
          <div className="alert-icon">💡</div>
          <div className="alert-content">
            <div className="alert-title">Before You Start</div>
            <div className="alert-message">
              Make sure your USB drive is plugged in before changing these settings.
              Check off each step as you complete it.
            </div>
          </div>
        </div>

        <ul className="checklist" style={{ marginTop: 'var(--space-xl)' }}>
          {BIOS_STEPS.map((step) => (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '20px' }}>{step.icon}</span>
                  <span className="checklist-text" style={{ fontWeight: 600 }}>
                    {step.title}
                  </span>
                </div>
                <div style={{ 
                  color: 'var(--color-text-muted)', 
                  fontSize: 'var(--font-size-sm)',
                  marginTop: 'var(--space-xs)',
                  marginLeft: '28px'
                }}>
                  {step.description}
                </div>
                {step.warning && (
                  <div style={{ 
                    color: 'var(--color-accent-orange)', 
                    fontSize: 'var(--font-size-xs)',
                    marginTop: 'var(--space-xs)',
                    marginLeft: '28px'
                  }}>
                    ⚠️ {step.warning}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {allComplete && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">UEFI Ready</div>
              <div className="alert-message">
                Your Surface is configured for macOS boot. 
                Plug in the USB and restart to begin installation.
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

export default BiosStep;
