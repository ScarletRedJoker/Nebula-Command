import axios, { AxiosInstance } from 'axios';

export interface ChatResponse {
    success: boolean;
    response?: string;
    model?: string;
    tokens?: number;
    error?: string;
    message?: string;
}

export interface AnalyzeResponse {
    success: boolean;
    analysis?: string;
    suggestions?: string[];
    error?: string;
    message?: string;
}

export interface GenerateResponse {
    success: boolean;
    code?: string;
    explanation?: string;
    error?: string;
    message?: string;
}

export interface DiffResponse {
    success: boolean;
    diff?: string;
    preview?: string;
    canApply?: boolean;
    changes?: {
        additions: number;
        deletions: number;
    };
    error?: string;
    message?: string;
}

export interface CollaborateResponse {
    success: boolean;
    conversation?: Array<{
        model: string;
        response: string;
        error?: boolean;
    }>;
    consensus?: string;
    error?: string;
    message?: string;
}

export class JarvisAPI {
    private client: AxiosInstance;
    private authenticated: boolean = false;

    constructor(
        private apiUrl: string,
        private username: string,
        private password: string
    ) {
        this.client = axios.create({
            baseURL: apiUrl,
            timeout: 60000,
            withCredentials: true
        });

        // Authenticate on initialization
        this.authenticate();
    }

    private async authenticate(): Promise<boolean> {
        try {
            const response = await this.client.post('/login', {
                username: this.username,
                password: this.password
            });

            this.authenticated = response.status === 200;
            return this.authenticated;
        } catch (error) {
            console.error('Authentication failed:', error);
            this.authenticated = false;
            return false;
        }
    }

    private async ensureAuthenticated(): Promise<void> {
        if (!this.authenticated) {
            await this.authenticate();
        }
    }

    async chat(
        message: string,
        context?: {
            file: string;
            selection: string;
            language: string;
        },
        conversationHistory?: Array<{role: string, content: string}>,
        model: string = 'gpt-5'
    ): Promise<ChatResponse> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/api/ide/chat', {
                message,
                context,
                conversation_history: conversationHistory,
                model
            });

            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Request failed'
            };
        }
    }

    async analyzeCode(
        code: string,
        language: string,
        action: 'analyze' | 'explain' | 'optimize' = 'analyze'
    ): Promise<AnalyzeResponse> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/api/ide/context', {
                code,
                language,
                action
            });

            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Request failed'
            };
        }
    }

    async generateCode(
        description: string,
        language: string,
        context?: string
    ): Promise<GenerateResponse> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/api/ide/generate', {
                description,
                language,
                context
            });

            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Request failed'
            };
        }
    }

    async generateDiff(
        original: string,
        generated: string,
        file: string
    ): Promise<DiffResponse> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/api/ide/apply', {
                original,
                generated,
                file
            });

            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Request failed'
            };
        }
    }

    async collaborate(
        question: string,
        code: string,
        models: string[] = ['gpt-5', 'gpt-4']
    ): Promise<CollaborateResponse> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.post('/api/ide/collaborate', {
                question,
                code,
                models
            });

            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Request failed'
            };
        }
    }

    async checkHealth(): Promise<{success: boolean, enabled: boolean, message: string}> {
        try {
            const response = await this.client.get('/api/ide/health');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                enabled: false,
                message: error.message || 'Health check failed'
            };
        }
    }
}
