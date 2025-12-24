import { AlertCircle } from 'lucide-react'

interface ApiKeysWarningProps {
    openaiApiKey: string
    mcpApiKey: string
}

export default function ApiKeysWarning({ openaiApiKey, mcpApiKey }: ApiKeysWarningProps) {
    if (openaiApiKey && mcpApiKey) {
        return null
    }

    const getMessage = () => {
        if (!openaiApiKey && !mcpApiKey)
            return 'Both API keys are missing. Please configure VITE_OPENAI_API_KEY and VITE_DIME_SCHEDULER_API_KEY in your .env file.'

        if (!openaiApiKey)
            return 'OpenAI API key is missing. Please configure VITE_OPENAI_API_KEY in your .env file.'

        return 'Dime.Scheduler API key is missing. Please configure VITE_DIME_SCHEDULER_API_KEY in your .env file.'
    }

    return (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
                <p className="font-medium text-sm text-yellow-900 dark:text-yellow-200">Missing API Keys</p>
                <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1">
                    {getMessage()}
                </p>
                <div className="mt-3 p-3 rounded bg-background border border-yellow-500/20">
                    <p className="text-xs text-muted-foreground mb-2">
                        Create a <code className="px-1.5 py-0.5 bg-muted rounded text-xs">.env</code> file in the project root:
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded border overflow-x-auto">
                        {`VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_DIME_SCHEDULER_API_KEY=your_dime_scheduler_api_key_here`}
                    </pre>
                </div>
            </div>
        </div>
    )
}

