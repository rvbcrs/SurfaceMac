import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import './index.css';

// Types
export type MacOSVersion = 'sonoma' | 'sequoia';
export type Platform = 'darwin' | 'win32' | 'linux';
export type CpuType = 'i5' | 'i7';

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
  efiSource: { type: 'default' | 'url' | 'local'; value: string };
  downloads: Record<string, string>;
}

interface WizardContextType {
  currentStep: number;
  completedSteps: number[];
  platform: Platform | null;
  macosVersion: MacOSVersion;
  setMacosVersion: (version: MacOSVersion) => void;
  cpuType: CpuType;
  setCpuType: (cpu: CpuType) => void;
  cpuDetected: boolean;
  config: WizardConfig;
  updateConfig: (updates: Partial<WizardConfig>) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
}

// Wizard Steps Configuration (simplified - downloads happen in background)
const STEPS = [
  { id: 1, title: 'Welcome', description: 'CPU & macOS version selection' },
  { id: 2, title: 'USB Preparation', description: 'Format and prepare USB' },
  { id: 3, title: 'SMBIOS', description: 'Generate serial numbers' },
  { id: 4, title: 'Configuration', description: 'Configure OpenCore' },
  { id: 5, title: 'BIOS Guide', description: 'UEFI settings' },
  { id: 6, title: 'Installation', description: 'Install macOS' },
  { id: 7, title: 'Post-Install', description: 'Finalize setup' },
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
import UsbStep from './steps/UsbStep';
import SmbiosStep from './steps/SmbiosStep';
import ConfigStep from './steps/ConfigStep';
import BiosStep from './steps/BiosStep';
import InstallStep from './steps/InstallStep';
import PostInstallStep from './steps/PostInstallStep';

const STEP_COMPONENTS: React.FC[] = [
  WelcomeStep,
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
  const [cpuType, setCpuType] = useState<CpuType>('i5');
  const [cpuDetected, setCpuDetected] = useState(false);
  const [config, setConfig] = useState<WizardConfig>({
    smbios: null,
    selectedUsb: null,
    efiPath: null,
    efiSource: { type: 'default', value: 'repo:balopez83/Surface-Pro-7-Hackintosh' },
    downloads: {},
  });
  
  // Permission state (macOS Full Disk Access)
  const [hasFullDiskAccess, setHasFullDiskAccess] = useState<boolean | null>(null);

  // Detect platform, CPU, and check permissions on mount
  useEffect(() => {
    const detectPlatform = async () => {
      if (window.electronAPI) {
        const p = await window.electronAPI.getPlatform();
        setPlatform(p as Platform);
        
        // Check Full Disk Access on macOS
        if (p === 'darwin') {
          try {
            const result = await window.electronAPI.checkFullDiskAccess();
            setHasFullDiskAccess(result.hasAccess);
          } catch (e) {
            console.warn('Could not check Full Disk Access:', e);
            setHasFullDiskAccess(null);
          }
        } else {
          setHasFullDiskAccess(true); // Not needed on other platforms
        }
      } else {
        // Browser fallback for development
        setPlatform(navigator.platform.includes('Mac') ? 'darwin' : 'win32');
        setHasFullDiskAccess(true);
      }
    };
    
    // Try to detect CPU type (works if running on the Surface Pro 7)
    const detectCpu = () => {
      // Check if we can detect CPU via browser API
      if (navigator.hardwareConcurrency) {
        // i5-1035G4 has 4 cores (8 threads), i7-1065G7 has 4 cores (8 threads)
        // Can't distinguish by core count, so check userAgent for hints
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('i7') || ua.includes('1065g7')) {
          setCpuType('i7');
          setCpuDetected(true);
        } else if (ua.includes('i5') || ua.includes('1035g4')) {
          setCpuType('i5');
          setCpuDetected(true);
        }
        // If running in Electron, we could use os.cpus() for better detection
      }
    };
    
    detectPlatform();
    detectCpu();
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
      cpuType,
      setCpuType,
      cpuDetected,
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

        {/* Full Disk Access Warning Banner */}
        {hasFullDiskAccess === false && (
          <div style={{
            background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <strong>Full Disk Access Required</strong>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>
                  Creating a bootable USB requires Full Disk Access for this app.
                </div>
              </div>
            </div>
            <button
              onClick={() => window.electronAPI?.openFullDiskSettings()}
              style={{
                background: 'white',
                color: '#b91c1c',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Open Settings
            </button>
          </div>
        )}

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
