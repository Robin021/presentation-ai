
export interface InfographicSession {
    id: string;
    topic: string;
    dsl: string;
    timestamp: number;
    description?: string;
    templateHint?: string;
    theme?: string;
}

const STORAGE_KEY = 'infographic_history';
const MAX_HISTORY_ITEMS = 20;

export function saveSession(session: Omit<InfographicSession, 'id' | 'timestamp'> & { id?: string }): InfographicSession {
    const history = getHistory();
    const timestamp = Date.now();

    // If updating an existing session (same ID), remove it first to re-add at top
    // Or if saving a new one, generate ID
    const id = session.id || crypto.randomUUID();

    const newSession: InfographicSession = {
        ...session,
        id,
        timestamp
    };

    // Filter out existing if we are updating (by ID) or prevent duplicates by exact content if needed
    // Here we'll just filter by ID if it was provided
    const filtered = history.filter(item => item.id !== id);

    // Add to top
    const newHistory = [newSession, ...filtered].slice(0, MAX_HISTORY_ITEMS);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {
        console.warn('Failed to save infographic history:', e);
    }

    return newSession;
}

export function getHistory(): InfographicSession[] {
    if (typeof window === 'undefined') return [];
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch (e) {
        console.warn('Failed to load infographic history:', e);
        return [];
    }
}

export function deleteSession(id: string): void {
    const history = getHistory();
    const newHistory = history.filter(item => item.id !== id);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {
        console.warn('Failed to delete session:', e);
    }
}

export function clearHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to clear history:', e);
    }
}
