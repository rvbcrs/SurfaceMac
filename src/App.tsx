import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import './index.css';

// Types
export type MacOSVersion = 'sonoma' | 'sequoia';
export type Platform = 'darwin' | 'win32' | 'linux';

export interface SMBIOSData {
  model: string;
  serial: string;
  mlb: string;
  uuid: string;
}

export interface USBDrive {
  id: string;
  name: string;
  size: string;
  path: string;
}

export interface WizardConfig {
  smbios: SMBIOSData | null;
  selectedUsb: USBDrive | null;
  efiPath: string | null;
  downloads: Record<string, string>;
}

interface WizardContextType {
  currentStep: number;
  completedSteps: number[];
  platform: Platform | null;
  macosVersion: MacOSVersion;
  setMacosVersion: (version: MacOSVersion) => void;
  config: WizardConfig;
  updateConfig: (updates: Partial<WizardConfig>) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
}

// Wizard Steps Configuration
const STEPS = [
  { id: 1, title: 'Welcome', description: 'Platform & version selection' },
  { id: 2, title: 'Downloads', description: 'Download required files' },
  { id: 3, title: 'USB Preparation', description: 'Format and prepare USB' },
  { id: 4, title: 'SMBIOS', description: 'Generate serial numbers' },
  { id: 5, title: 'Configuration', description: 'Configure OpenCore' },
  { id: 6, title: 'BIOS Guide', description: 'UEFI settings' },
  { id: 7, title: 'Installation', description: 'Install macOS' },
  { id: 8, title: 'Post-Install', description: 'Finalize setup' },
];

// Wizard Context
const WizardContext = createContext<WizardContextType | null>(null);

export const useWizard = (): WizardContextType => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within WizardProvider');
  }
  return context;
};

// Import step components
import WelcomeStep from './steps/WelcomeStep';
import DownloadsStep from './steps/DownloadsStep';
import UsbStep from './steps/UsbStep';
import SmbiosStep from './steps/SmbiosStep';
import ConfigStep from './steps/ConfigStep';
import BiosStep from './steps/BiosStep';
import InstallStep from './steps/InstallStep';
import PostInstallStep from './steps/PostInstallStep';

const STEP_COMPONENTS: React.FC[] = [
  WelcomeStep,
  DownloadsStep,
  UsbStep,
  SmbiosStep,
  ConfigStep,
  BiosStep,
  InstallStep,
  PostInstallStep,
];

function App(): ReactNode {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [macosVersion, setMacosVersion] = useState<MacOSVersion>('sonoma');
  const [config, setConfig] = useState<WizardConfig>({
    smbios: null,
    selectedUsb: null,
    efiPath: null,
    downloads: {},
  });

  // Detect platform on mount
  useEffect(() => {
    const detectPlatform = async () => {
      if (window.electronAPI) {
        const p = await window.electronAPI.getPlatform();
        setPlatform(p as Platform);
      } else {
        // Browser fallback for development
        setPlatform(navigator.platform.includes('Mac') ? 'darwin' : 'win32');
      }
    };
    detectPlatform();
  }, []);

  const goToStep = (step: number): void => {
    if (step >= 1 && step <= STEPS.length) {
      setCurrentStep(step);
    }
  };

  const nextStep = (): void => {
    if (currentStep < STEPS.length) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateConfig = (updates: Partial<WizardConfig>): void => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const CurrentStepComponent = STEP_COMPONENTS[currentStep - 1];

  return (
    <WizardContext.Provider value={{
      currentStep,
      completedSteps,
      platform,
      macosVersion,
      setMacosVersion,
      config,
      updateConfig,
      nextStep,
      prevStep,
      goToStep,
    }}>
      <div className="app">
        {/* Title Bar */}
        <div className="titlebar">
          <span className="titlebar-title">SurfaceMac Wizard</span>
        </div>

        <div className="main-content">
          {/* Sidebar with Steps */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">🍎 SurfaceMac</div>
              <div className="sidebar-subtitle">Surface Pro 7 → macOS</div>
            </div>

            <ul className="step-list">
              {STEPS.map((step) => (
                <li
                  key={step.id}
                  className={`step-item ${currentStep === step.id ? 'active' : ''} ${completedSteps.includes(step.id) ? 'completed' : ''}`}
                >
                  <div className="step-number">
                    {completedSteps.includes(step.id) ? '✓' : step.id}
                  </div>
                  <div className="step-content">
                    <div className="step-title">{step.title}</div>
                    <div className="step-description">{step.description}</div>
                  </div>
                </li>
              ))}
            </ul>

            {platform && (
              <div className="sidebar-footer" style={{ 
                marginTop: 'auto', 
                padding: 'var(--space-md)',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)'
              }}>
                Platform: {platform === 'darwin' ? '🍎 macOS' : '🪟 Windows'}
              </div>
            )}
          </aside>

          {/* Main Content Area */}
          <main className="content-area">
            <CurrentStepComponent />
          </main>
        </div>
      </div>
    </WizardContext.Provider>
  );
}

export default App;
