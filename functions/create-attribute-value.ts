import { Env, LogEntry } from "./backendTypes";

class Logger {
    private logs: LogEntry[] = [];
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    log(event: string, details?: any) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            event,
            details,
            duration: Date.now() - this.startTime
        };
        this.logs.push(entry);
        console.log(JSON.stringify(entry));
    }

    getLogs() {
        return this.logs;
    }
}

function normalizeUrl(url: string): string {
    url = url.replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

interface CreateAttributeValueRequest {
    attributeCode: string;
    value: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const request = context.request;
    const env = context.env;
    const logger = new Logger();
    logger.log('Worker started', { method: request.method });

    try {
        const { attributeCode, value } = await request.json() as CreateAttributeValueRequest;

        if (!attributeCode || !value) {
            return new Response(JSON.stringify({
                error: 'Attribute code and value are required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

        // First, get the attribute details to ensure it exists
        const attributeResponse = await fetch(
            `${baseUrl}/rest/V1/products/attributes/${attributeCode}`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                }
            }
        );

        if (!attributeResponse.ok) {
            throw new Error(`Attribute ${attributeCode} not found`);
        }

        const attribute = await attributeResponse.json();

        // Create the new option
        const response = await fetch(
            `${baseUrl}/rest/V1/products/attributes/${attributeCode}/options`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    option: {
                        label: value,
                        sortOrder: 0,
                        isDefault: false,
                        storeLabels: [{
                            storeId: 0,
                            label: value
                        }]
                    }
                }),
            }
        );

        if (!response.ok) {
            const error: any = await response.json();
            throw new Error(`Failed to create attribute value: ${error.message}`);
        }

        const result = await response.json();

        logger.log('Created attribute value', {
            attributeCode,
            value,
            result
        });

        // After creating, fetch the updated attribute to get the new option's ID
        const updatedAttributeResponse = await fetch(
            `${baseUrl}/rest/V1/products/attributes/${attributeCode}`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                }
            }
        );

        const updatedAttribute: any = await updatedAttributeResponse.json();
        const newOption = updatedAttribute.options.find((opt: any) => opt.label === value);

        return new Response(JSON.stringify({
            success: true,
            option: newOption,
            logs: logger.getLogs()
        }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        const error = err as Error;
        logger.log('Failed to create attribute value', { error: error.message });

        return new Response(JSON.stringify({
            error: error.message,
            logs: logger.getLogs()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};