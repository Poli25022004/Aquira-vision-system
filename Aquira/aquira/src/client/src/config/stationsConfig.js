/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  STAZIONI DI PRODUZIONE - CONFIGURAZIONE
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const defaultStations = [
    {
        id: 'station-1',
        name: 'Stazione Assemblaggio',
        description: 'Area di assemblaggio principali componenti',
        status: 'active', // active, inactive, error
        location: 'Linea A - Reparto 1',
        producedItems: 2450,
        defectiveItems: 18,
        defectRate: 0.73,
        cameras: [
            { id: 'cam-1-1', name: 'Camera Frontale', position: 'Superiore', status: 'active', fps: 30, resolution: '1920x1080' },
            { id: 'cam-1-2', name: 'Camera Laterale', position: 'Sinistra', status: 'active', fps: 30, resolution: '1920x1080' }
        ]
    },
    {
        id: 'station-2',
        name: 'Stazione Ispezione Qualità',
        description: 'Controllo qualità e rilevamento difetti',
        status: 'active',
        location: 'Linea A - Reparto 2',
        producedItems: 2450,
        defectiveItems: 12,
        defectRate: 0.49,
        cameras: [
            { id: 'cam-2-1', name: 'Camera HD Superiore', position: 'Verticale', status: 'active', fps: 60, resolution: '2560x1920' },
            { id: 'cam-2-2', name: 'Camera Macro', position: 'Dettagli', status: 'active', fps: 30, resolution: '1920x1080' },
            { id: 'cam-2-3', name: 'Camera Termale', position: 'Temperature', status: 'inactive', fps: 15, resolution: '640x480' }
        ]
    },
    {
        id: 'station-3',
        name: 'Stazione Confezionamento',
        description: 'Imballaggio e preparazione spedizione',
        status: 'active',
        location: 'Linea B - Reparto 3',
        producedItems: 1890,
        defectiveItems: 8,
        defectRate: 0.42,
        cameras: [
            { id: 'cam-3-1', name: 'Camera Confezionamento', position: 'Principale', status: 'active', fps: 30, resolution: '1920x1080' },
            { id: 'cam-3-2', name: 'Camera Etichettatura', position: 'Dettagli', status: 'active', fps: 30, resolution: '1920x1080' }
        ]
    }
];

/**
 * THEME INDUSTRIALE TECNICO - Computer Vision Grade
 * Colori: Verde scuro, grigio metallico, blu freddo
 */
export const industrialTheme = {
    primary: '#0d8659',          // Verde scuro primario (industriale)
    primaryLight: '#1fb373',     // Verde chiaro
    accent: '#00d4aa',           // Cyan/Teal (accenti)
    accent2: '#ff6b35',          // Arancione (warning)
    success: '#2dd4bf',          // Verde acqua (OK)
    error: '#ef4444',            // Rosso (scarto)
    warning: '#f59e0b',          // Giallo (warning)
    
    // Backgrounds
    bgDark: '#0f172a',           // Blu scuro navy
    bgMedium: '#1a2332',         // Grigio blu scuro
    bgLight: '#273548',          // Grigio blu più chiaro
    
    // Text
    textPrimary: '#e2e8f0',
    textSecondary: '#cbd5e1',
    textTertiary: '#94a3b8',
    
    // Borders
    borderDark: 'rgba(13, 134, 89, 0.15)',
    borderLight: 'rgba(13, 134, 89, 0.3)',
    borderBright: 'rgba(13, 134, 89, 0.5)'
};

export const cameraStatusColors = {
    active: industrialTheme.success,      // Verde acqua
    inactive: industrialTheme.warning,    // Giallo
    error: industrialTheme.error          // Rosso
};

export const stationStatusIcons = {
    active: '●',
    inactive: '○',
    error: '✕'
};

/**
 * ANALISI QUALITA' - Metriche Statistiche
 */
export const qualityMetrics = {
    defectTypes: [
        { id: 'scratches', name: 'Graffi', color: industrialTheme.warning },
        { id: 'dimensional', name: 'Dimensionali', color: industrialTheme.error },
        { id: 'surface', name: 'Superficie', color: industrialTheme.accent2 },
        { id: 'assembly', name: 'Assemblaggio', color: '#a855f7' },
        { id: 'other', name: 'Altro', color: '#6366f1' }
    ]
};
