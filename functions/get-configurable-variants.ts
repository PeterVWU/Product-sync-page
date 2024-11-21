import { Env, LogEntry } from "./backendTypes";

function normalizeUrl(url: string): string {
    url = url.replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { searchParams } = new URL(context.request.url);
    const sku = searchParams.get('sku');
    const env = context.env;

    if (!sku) {
        return new Response(JSON.stringify({ error: 'SKU parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const baseUrl = normalizeUrl(env.MAGENTO_BASE_URL);

        // Get children products
        const response = await fetch(
            `${baseUrl}/rest/V1/configurable-products/${encodeURIComponent(sku)}/children`,
            {
                headers: {
                    Authorization: `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                }
            }
        );

        if (!response.ok) {
            // If the product is not found or has no children, return empty array
            if (response.status === 404) {
                return new Response(JSON.stringify({ childSkus: [] }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            throw new Error(`Failed to fetch variants: ${response.statusText}`);
        }

        const children: any = await response.json();
        const childSkus = children.map((child: any) => child.sku);

        return new Response(JSON.stringify({ childSkus }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: (error as Error).message,
            childSkus: [] // Return empty array on error
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};