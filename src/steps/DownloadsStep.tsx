import { useState } from 'react';
import { useWizard, MacOSVersion } from '../App';

interface DownloadItem {
  id: string;
  name: string;
  description: string;
  url?: string;
  icon: string;
  isRecovery?: boolean;
}

type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error';

const DOWNLOADS: DownloadItem[] = [
  {
    id: 'efi',
    name: 'Surface Pro 7 EFI',
    description: 'Base OpenCore configuration for SP7',
    url: 'https://github.com/balopez83/Surface-Pro-7-Hackintosh/archive/refs/heads/main.zip',
    icon: '📦',
  },
  {
    id: 'opencore',
    name: 'OpenCore Bootloader',
    description: 'Latest release from acidanthera',
    url: 'https://github.com/acidanthera/OpenCorePkg/releases/latest',
    icon: '🔧',
  },
  {
    id: 'gensmbios',
    name: 'GenSMBIOS',
    description: 'Generate unique serial numbers',
    url: 'https://github.com/corpnewt/GenSMBIOS/archive/refs/heads/master.zip',
    icon: '🔑',
  },
  {
    id: 'macrecovery',
    name: 'macOS Recovery Image',
    description: 'BaseSystem.dmg (~600MB)',
    icon: '💿',
    isRecovery: true,
  },
];

const WIFI_DOWNLOADS: Record<MacOSVersion, DownloadItem> = {
  sonoma: {
    id: 'airportitlwm',
    name: 'AirportItlwm (Sonoma)',
    description: 'Native WiFi integration for Sonoma',
    url: 'https://github.com/OpenIntelWireless/itlwm/releases/latest',
    icon: '📶',
  },
  sequoia: {
    id: 'itlwm',
    name: 'itlwm + HeliPort (Sequoia)',
    description: 'WiFi via HeliPort app',
    url: 'https://github.com/OpenIntelWireless/itlwm/releases/latest',
    icon: '📶',
  },
};

const DownloadsStep: React.FC = () => {
  const { nextStep, prevStep, macosVersion, updateConfig } = useWizard();
  const [downloadStatus, setDownloadStatus] = useState<Record<string, DownloadStatus>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentDownload, setCurrentDownload] = useState<string | null>(null);

  const allDownloads = [...DOWNLOADS, WIFI_DOWNLOADS[macosVersion]];

  const startDownloads = async (): Promise<void> => {
    setIsDownloading(true);
    
    for (const download of allDownloads) {
      setCurrentDownload(download.id);
      setDownloadStatus(prev => ({ ...prev, [download.id]: 'downloading' }));
      
      // Simulate download progress (in real app, use electronAPI)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In real implementation:
      // if (window.electronAPI) {
      //   try {
      //     if (download.isRecovery) {
      //       await window.electronAPI.downloadRecovery(macosVersion);
      //     } else if (download.url) {
      //       await window.electronAPI.downloadFile(download.url, download.id);
      //     }
      //     setDownloadStatus(prev => ({ ...prev, [download.id]: 'completed' }));
      //   } catch (error) {
      //     setDownloadStatus(prev => ({ ...prev, [download.id]: 'error' }));
      //   }
      // }
      
      setDownloadStatus(prev => ({ ...prev, [download.id]: 'completed' }));
    }
    
    setCurrentDownload(null);
    setIsDownloading(false);
    updateConfig({ downloads: downloadStatus as Record<string, string> });
  };

  const allCompleted = allDownloads.every(d => downloadStatus[d.id] === 'completed');

  return (
    <>
      <header className="content-header">
        <h1 className="content-title">Download Required Files</h1>
        <p className="content-subtitle">
          We'll download the EFI configuration, bootloader, and {macosVersion === 'sequoia' ? 'HeliPort' : 'WiFi drivers'}.
        </p>
      </header>

      <div className="content-body fade-in">
        <div className="download-list">
          {allDownloads.map((download) => (
            <div 
              key={download.id} 
              className={`download-item ${downloadStatus[download.id] || ''}`}
            >
              <div className="download-icon">
                {downloadStatus[download.id] === 'completed' ? '✓' : 
                 downloadStatus[download.id] === 'downloading' ? <div className="spinner" /> :
                 download.icon}
              </div>
              <div className="download-info">
                <div className="download-name">{download.name}</div>
                <div className="download-status">
                  {downloadStatus[download.id] === 'downloading' ? 'Downloading...' :
                   downloadStatus[download.id] === 'completed' ? 'Downloaded' :
                   downloadStatus[download.id] === 'error' ? 'Error - Click to retry' :
                   download.description}
                </div>
                {downloadStatus[download.id] === 'downloading' && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '60%' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {!isDownloading && !allCompleted && (
          <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={startDownloads}>
              📥 Start Downloads
            </button>
          </div>
        )}

        {allCompleted && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-xl)' }}>
            <div className="alert-icon">✅</div>
            <div className="alert-content">
              <div className="alert-title">All Downloads Complete</div>
              <div className="alert-message">
                All required files have been downloaded. Click Next to prepare your USB drive.
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
          disabled={!allCompleted}
        >
          Next →
        </button>
      </footer>
    </>
  );
};

export default DownloadsStep;
