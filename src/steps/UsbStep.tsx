import { useState, useRef, useEffect } from 'react';
import { useWizard } from '../App';

// Local type definition (mirrors the global one for explicit typing)
interface USBDrive {
  id: string;
  name: string;
  size: string;
  path: string;
}


const UsbStep: React.FC = () => {
  const { nextStep, prevStep, platform, updateConfig, macosVersion, config, cpuType } = useWizard();
  // const [showWarning, setShowWarning] = useState(true); // Removed in favor of footer

  const [usbDrives, setUsbDrives] = useState<USBDrive[]>([]);
  const [selectedUsb, setSelectedUsb] = useState<USBDrive | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [formatComplete, setFormatComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enhanced Progress
  const [formatStatus, setFormatStatus] = useState<string>('');
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [skipFormat, setSkipFormat] = useState(false);
  const [skipEfiCopy, setSkipEfiCopy] = useState(false);

  // Installer type: 'recovery' (800MB, needs internet) or 'full' (13GB, offline)
  const [installerType, setInstallerType] = useState<'recovery' | 'full'>('recovery');
  
  // Force format option - bypasses partition existence check
  const [forceFormat, setForceFormat] = useState<boolean>(false);

  // Auto-select Full Installer for Sequoia due to WiFi limitations
  useEffect(() => {
    if (macosVersion === 'sequoia') {
      setInstallerType('full');
    } else {
      setInstallerType('recovery'); // Default back to recovery for Sonoma
    }
  }, [macosVersion]);


  // Check Admin on mount (Windows)
  useEffect(() => {
    if (platform === 'win32' && window.electronAPI) {
      window.electronAPI.checkAdmin().then((isAdmin) => {
        if (!isAdmin) {
          setError('⚠️ WARNING: Administrator privileges are missing! Please restart the app/terminal as Administrator (Right-click -> Run as Administrator), otherwise writing to the USB will fail.');
        }
      });
    }
  }, [platform]);

  // Load USB drives on mount and listeners
  const refreshDrives = async (): Promise<void> => {
    // Only clear error if it's not the admin warning
    // Actually, refreshDrives is called manually mostly, so we can clear.
    // But on mount we don't want to clear the admin warning we just set.
    // Let's handle error clearing carefully.
    setError(prev => prev && prev.includes('Administrator') ? prev : null);

    try {
      if (window.electronAPI) {
        const drives = await window.electronAPI.listUSBDrives();
        setUsbDrives(drives as USBDrive[]);
      } else {
        // Browser fallback - show mock data
        setUsbDrives([
          { id: 'disk2', name: 'USB Drive (Mock)', size: '32 GB', path: '/dev/disk2' },
        ]);
      }
    } catch (err) {
      setError('Failed to detect USB drives');
      console.error(err);
    }
  };

  // Load USB drives on mount and listeners
  useEffect(() => {
    refreshDrives();

    if (window.electronAPI) {
      // Download progress
      window.electronAPI.onDownloadProgress((p) => {
        const overallProgress = 20 + (p.percent * 0.6);
        setProgress(overallProgress);
      });

      // Detailed format/EFI status
      window.electronAPI.onFormatStatus((message) => {
        setFormatStatus(message);
        // Auto-scroll to progress bar on update if it exists
        if (progressBarRef.current) {
          progressBarRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      // Copy Progress (EFI files)
      window.electronAPI.onCopyProgress((file) => {
        setFormatStatus(`Copying: ${file}`);
      });
    }
  }, []);

  const startProcess = async (): Promise<void> => {
    if (!selectedUsb) return;

    setIsProcessing(true);
    setFormatComplete(false);
    setError(null);
    setProgress(0);
    setProcessStep('Initializing...');
    setFormatStatus('Starting process...');

    // Scroll progress bar into view
    setTimeout(() => {
      if (progressBarRef.current) {
        progressBarRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    try {

      if (window.electronAPI) {
        if (!skipFormat) {
          // Step 1: Format USB drive (0-20%)
          setProcessStep('Formatting USB drive...');
          setProgress(10);

          // Recovery uses FAT32 (Cross-platform compatible, native boot)
          // Full Installer uses ExFAT (Hybrid, >4GB support, works on both platforms)
          // NOTE: Boot files (BaseSystem.dmg) go to FAT32 EFI partition, data (.app) to ExFAT
          const format = installerType === 'full' ? 'ExFAT' : 'FAT32';

          const formatResult = await window.electronAPI.formatUSB(selectedUsb.path, format, forceFormat);
          setProgress(20);

          // Step 2: Download macOS (20-80%)
          const isFullInstaller = installerType === 'full';
          const downloadSize = isFullInstaller ? '~13 GB' : '~800 MB';
          setProcessStep(`Downloading macOS ${macosVersion === 'sonoma' ? 'Sonoma' : 'Sequoia'} ${isFullInstaller ? 'Full Installer' : 'Recovery'}...`);
          setFormatStatus(`Preparing ${downloadSize} download...`);

          // Listen for download progress with appropriate unit display
          const progressListener = (progress: { percent: number; downloaded: number; total: number }) => {
            if (progress.total > 0) {
              // Use GB for full installer, MB for recovery
              const useGB = progress.total > 1024 * 1024 * 1024;
              const downloaded = useGB
                ? (progress.downloaded / (1024 * 1024 * 1024)).toFixed(2)
                : (progress.downloaded / (1024 * 1024)).toFixed(1);
              const total = useGB
                ? (progress.total / (1024 * 1024 * 1024)).toFixed(2)
                : (progress.total / (1024 * 1024)).toFixed(0);
              const unit = useGB ? 'GB' : 'MB';
              setFormatStatus(`Downloading: ${downloaded} / ${total} ${unit} (${progress.percent.toFixed(0)}%)`);
              // Update main progress bar (20-80% range)
              setProgress(20 + (progress.percent * 0.6));
            }
          };
          window.electronAPI.onDownloadProgress(progressListener);

          if (isFullInstaller) {
            // Full installer path: download pkg
            setProcessStep('Downloading macOS Full Installer...');
            const result = await window.electronAPI.downloadFullInstaller(macosVersion);
            setProgress(50);

            // NATIVE FLOW (HFS+) vs HYBRID FLOW (ExFAT)
            // If ExFAT is used, we MUST use the Hybrid flow because createinstallmedia only does HFS+.
            if (platform === 'darwin' && format !== 'ExFAT') {
              // macOS Native: Run createinstallmedia (traditional approach)
              setProcessStep('Creating bootable USB (this takes ~20 minutes)...');
              setFormatStatus('Running createinstallmedia...');
              // Full Installer always creates "Install macOS [Version]" volume
              // But createInstallMedia command takes volume path to *mount point*
              // We pass the volume path returned by format, or fallback to standard logic
              // Since createInstallMedia erases again, it doesn't matter much unless access path changes.
              // Use extracted path if available (from gibMacOS service) so we don't need /Applications
              await window.electronAPI.createInstallMedia(result.extractedPath || result.installerPath, formatResult.volumePath || `/Volumes/Install macOS`);
            } else {
              // Hybrid Mode (Windows or macOS ExFAT): Extract App + Recovery
              setProcessStep('Extracting full macOS Installer (Hybrid Mode)...');
              setFormatStatus(`Unpacking InstallAssistant.pkg with ${platform === 'darwin' ? 'pkgutil' : '7-Zip'}...`);
              
              // 1. Extract Full App (New Step - Heavy)
              const appResult = await window.electronAPI.extractAppFromPkg(result.installerPath);
              setProgress(65);

              // 2. Use Pre-Downloaded Recovery Files (Hybrid Approach)
              // These were downloaded from Apple's Recovery servers during downloadFullInstaller
              setProcessStep('Using pre-downloaded recovery files...');
              
              // Derive version from installer path or use default
              // The installer path already contains the full path including home dir, so we can derive from that
              const versionMatch = result.installerPath.match(/SurfaceMac_Installer[/\\\\]([^/\\\\]+)[/\\\\]/);
              const recoveryVersion = versionMatch ? versionMatch[1] : macosVersion;
              
              // Get the Downloads folder path from the installer path
              // e.g. /Users/rvbcrs/Downloads/SurfaceMac_Installer/sonoma/InstallAssistant.pkg
              // -> /Users/rvbcrs/Downloads
              const downloadsMatch = result.installerPath.match(/^(.+[/\\\\]Downloads)[/\\\\]/);
              const downloadsDir = downloadsMatch ? downloadsMatch[1] : '/Users/Shared/Downloads';
              const hybridRecoveryDir = `${downloadsDir}/SurfaceMac_Recovery_Hybrid/${recoveryVersion}`;
              const hybridBaseSystemPath = `${hybridRecoveryDir}/BaseSystem.dmg`;
              const hybridChunklistPath = `${hybridRecoveryDir}/BaseSystem.chunklist`;
              
              console.log(`[Hybrid] Using pre-downloaded recovery: ${hybridBaseSystemPath}`);
              setProgress(70);

              // 3. Use dedicated BOOT (FAT32) partition for recovery files
              // formatResult.bootVolumePath = '/Volumes/BOOT'
              console.log(`[Hybrid] Using BOOT partition for recovery: ${formatResult.bootVolumePath}`);

              // 4. Copy Recovery to BOOT partition
              setProcessStep('Copying recovery files to BOOT...');
              setFormatStatus(`Copying BaseSystem.dmg to BOOT partition...`);
              await window.electronAPI.copyRecoveryToUsb({
                baseSystemPath: hybridBaseSystemPath,
                baseChunklistPath: hybridChunklistPath,
                usbVolumePath: formatResult.bootVolumePath || 'D:\\\\', // Use specific BOOT path
              });
              
              // 5. Copy Full App to INSTALL partition (ExFAT)
              setProcessStep('Copying full macOS Installer to INSTALL...');
              setFormatStatus('Copying ~13GB payload to INSTALL partition...');
              await window.electronAPI.copyAppToUsb({
                appPath: appResult.appPath,
                usbVolumePath: formatResult.volumePath || 'D:\\', // Primary volume (INSTALL)
                // SharedSupport.dmg is inside the app's Contents/SharedSupport/ folder (if extracted)
                sharedSupportSource: undefined // Not needed, it's inside the app
              });
            }
          } else {
            // Recovery path: just download BaseSystem.dmg
            // Pass the volume path from format (e.g. /Volumes/INSTALL) so we copy there
            await window.electronAPI.downloadRecovery(macosVersion, formatResult.volumePath);
          }
          setProgress(80);
        } else {
          console.log('Skipping Format & Recovery as requested.');
          setProcessStep('Skipping Format & Recovery...');
          setFormatStatus('Initializing EFI Update...');
          setProgress(50);
          // Short delay for UX
          await new Promise(r => setTimeout(r, 800));
        }

        // Step 3: Copy EFI folder to USB (80-100%)
        if (!skipEfiCopy) {
          setProcessStep('Setting up EFI...');

          let efiSourcePath = '';
          if (config.efiSource.type === 'default') {
            const repo = 'repo:balopez83/Surface-Pro-7-Hackintosh';
            setProcessStep('Downloading EFI from GitHub...');
            efiSourcePath = await window.electronAPI.downloadDefaultEFI(repo);
          } else if (config.efiSource.type === 'url') {
            setProcessStep('Downloading custom EFI...');
            efiSourcePath = await window.electronAPI.downloadDefaultEFI(config.efiSource.value);
          } else {
            efiSourcePath = config.efiSource.value;
          }

          if (efiSourcePath) {
            // Patch EFI locally (safe & fast) use new API
            setProcessStep('Patching EFI (Adding ExFatDxe)...');
            await window.electronAPI.patchEfiExFat(efiSourcePath);

            // Mount & Copy
            setProcessStep('Mounting EFI Partition...');
            setFormatStatus('Mounting...');
            // Ensure we pass the disk path correctly
            const usbEfiPath = await window.electronAPI.mountEFI(selectedUsb.path);

            setProcessStep('Copying EFI files to USB...');
            setFormatStatus('Copying... (This may ask for Admin permission once)');
            await window.electronAPI.copyEFI(efiSourcePath, usbEfiPath);

            console.log('EFI Setup complete.');
            setFormatStatus('EFI Setup complete!');
          } else {
            console.warn('No EFI source available.');
          }
        } else {
          // Just mount the EFI for the next step
          setProcessStep('Mounting EFI for Configuration...');
          setFormatStatus('Mounting...');
          await window.electronAPI.mountEFI(selectedUsb.path);
          setFormatStatus('Ready for Configuration');
        }

        // Step 4: Inject & Patch Configuration (Critical Step)
        setProcessStep('Configuring OpenCore...');
        setFormatStatus('Patching config.plist & Cleaning up...');
        
        await window.electronAPI.injectConfig({
          cpuType: cpuType,
          smbios: config.smbios,
          macosVersion: macosVersion, // for airportitlwm toggling
          diskPath: selectedUsb.path,
          verbose: true
        });
        
        console.log('Config Injection complete.');

        setProgress(100);
      } else {
        // Browser fallback - simulate the full process
        setProcessStep('Formatting...');
        setProgress(10);
        await new Promise(resolve => setTimeout(resolve, 1000));

        setProcessStep('Downloading Recovery Image...');
        for (let i = 20; i <= 80; i += 10) {
          setProgress(i);
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        setProcessStep('Copying EFI...');
        setProgress(90);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setProgress(100);
      }

      setFormatComplete(true);
      setProcessStep('Complete!');
      setFormatStatus('USB Creation Successful!');
      updateConfig({ selectedUsb });
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed: ${errorMessage}`);
      setFormatStatus(`Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <header className="content-header" style={{ paddingBottom: 'var(--space-md)' }}>
        <h1 className="content-title">USB Preparation</h1>
        <p className="content-subtitle">
          Select your USB drive. We'll format it and create the macOS Recovery installer.
        </p>
      </header>

      <div className="content-body fade-in" style={{ paddingTop: 'var(--space-lg)' }}>


        {/* Installer Type Selection */}
        {/* Installer Type Selection */}
        <div className="card" style={{ marginTop: 'var(--space-md)', background: 'rgba(30, 30, 40, 0.5)' }}>
          <div style={{ marginBottom: 'var(--space-md)', opacity: skipFormat ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <label className="label" style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>
              Installer Type
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                cursor: (isProcessing || skipFormat) ? 'not-allowed' : 'pointer',
                padding: 'var(--space-sm)',
                borderRadius: 'var(--radius-sm)',
                background: installerType === 'recovery' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                border: installerType === 'recovery' ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
                flex: 1,
                minWidth: '200px'
              }}>
                <input
                  type="radio"
                  name="installerType"
                  checked={installerType === 'recovery'}
                  onChange={() => setInstallerType('recovery')}
                  disabled={isProcessing || skipFormat}
                  style={{ marginRight: '10px', marginTop: '4px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>⚡ Recovery Image</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8 }}>~800 MB, needs internet during install</div>
                  {macosVersion === 'sequoia' && (
                    <div style={{ marginTop: '4px', color: 'var(--color-status-warning)', fontSize: '0.75rem' }}>
                      ⚠️ Requires USB Ethernet
                    </div>
                  )}
                </div>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                cursor: (isProcessing || skipFormat) ? 'not-allowed' : 'pointer',
                padding: 'var(--space-sm)',
                borderRadius: 'var(--radius-sm)',
                background: installerType === 'full' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                border: installerType === 'full' ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
                flex: 1,
                minWidth: '200px'
              }}>
                <input
                  type="radio"
                  name="installerType"
                  checked={installerType === 'full'}
                  onChange={() => setInstallerType('full')}
                  disabled={isProcessing || skipFormat}
                  style={{ marginRight: '10px', marginTop: '4px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>🎯 Full Installer (Recommended)</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8 }}>~13 GB download, offline install</div>
                  {macosVersion === 'sequoia' && (
                    <div style={{ marginTop: '4px', color: 'var(--color-status-success)', fontSize: '0.75rem' }}>
                      ✓ Best for Sequoia (No WiFi needed)
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Skip Options */}
        <div style={{ marginTop: 'var(--space-md)' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={skipFormat}
              onChange={(e) => {
                setSkipFormat(e.target.checked);
                if (!e.target.checked) setSkipEfiCopy(false); // Can't skip copy if we are formatting
                if (e.target.checked) setForceFormat(false); // Can't force format if skipping
              }}
              style={{ marginRight: '10px' }}
              disabled={isProcessing}
            />
            <span>
              <strong>Update EFI Only</strong> (Skip Format & Recovery)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: '8px', marginLeft: '24px' }}>
            <input
              type="checkbox"
              checked={forceFormat}
              onChange={(e) => {
                setForceFormat(e.target.checked);
                if (e.target.checked) setSkipFormat(false); // Can't skip format if forcing
              }}
              style={{ marginRight: '10px' }}
              disabled={isProcessing || skipFormat}
            />
            <span style={{ opacity: skipFormat ? 0.5 : 1 }}>
              <strong>Force Format</strong> (Re-format even if partitions exist)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginLeft: '24px' }}>
            <input
              type="checkbox"
              checked={skipEfiCopy}
              onChange={(e) => {
                setSkipEfiCopy(e.target.checked);
                if (e.target.checked) setSkipFormat(true); // Must skip format if skipping copy
              }}
              style={{ marginRight: '10px' }}
              disabled={isProcessing}
            />
            <span>
              <strong>Skip EFI Copy</strong> (Use existing EFI on USB)
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-xl)' }}>
          <h3>Select USB Drive</h3>
          <button className="btn btn-ghost" onClick={refreshDrives} disabled={isProcessing}>
            🔄 Refresh
          </button>
        </div>

        {usbDrives.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p>No USB drives detected. Please insert a 16GB+ USB drive.</p>
          </div>
        ) : (
          <div className="grid-list">
            {usbDrives.map(drive => (
              <div
                key={drive.id}
                className={`card ${selectedUsb?.id === drive.id ? 'selected' : ''}`}
                onClick={() => !isProcessing && setSelectedUsb(drive)}
                style={{ 
                  cursor: isProcessing ? 'default' : 'pointer',
                  ...(selectedUsb?.id === drive.id ? {
                    boxShadow: '0 0 15px 3px rgba(52, 211, 153, 0.5)',
                    border: '2px solid var(--color-success)',
                    transform: 'scale(1.02)'
                  } : {})
                }}
              >
                <div className="card-header">
                  <div className="card-icon">💾</div>
                  <div>
                    <div className="card-title">{drive.name}</div>
                    <div className="card-description">{drive.size} • {drive.path}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(isProcessing || formatComplete) && (
          <div style={{ marginTop: 'var(--space-xl)' }} ref={progressBarRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
              <span>{processStep}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            {formatStatus && (
              <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                {formatStatus}
              </div>
            )}
          </div>
        )}

        {formatComplete && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">USB Prepared Successfully!</div>
              <div className="alert-message">
                Your USB drive is ready. Please click <strong>Next</strong> to configure the EFI serial numbers.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="alert-icon">❌</div>
            <div className="alert-content">{error}</div>
          </div>
        )}

      </div>

      <footer className="content-footer">
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', maxWidth: '50%', lineHeight: '1.3' }}>
          <strong style={{ color: 'var(--color-status-warning)' }}>⚠️ Warning:</strong><br />
          Formatting erases ALL data on USB.<br />
          Backup files before starting.
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button className="btn btn-secondary" onClick={prevStep} disabled={isProcessing}>
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (formatComplete) {
                nextStep();
              } else {
                startProcess();
              }
            }}
            disabled={!selectedUsb || (isProcessing && !formatComplete)}
          >
            {formatComplete ? 'Next' : 'Start Process'}
          </button>
        </div>
      </footer>
    </>
  );
};

export default UsbStep;
