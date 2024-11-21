import { Env, LogEntry, MagentoCategoryResponse, MagentoCategory } from "./backendTypes";

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

function buildCategoryHierarchy(categories: MagentoCategory[]): Array<{
    label: string;
    value: string;
    level: number;
    parentId: number;
    path: string[];
}> {
    // Create a map for quick lookup
    const categoryMap = new Map<number, MagentoCategory>();
    categories.forEach(cat => categoryMap.set(cat.id, cat));

    // Find the "Default Category" ID to exclude it from paths
    const defaultCategoryId = categories.find(cat =>
        cat.level === 1 && cat.name === "Default Category"
    )?.id;

    // Get category path names
    const getCategoryPath = (category: MagentoCategory): string[] => {
        const pathIds = category.path.split('/').map(Number)
            .filter(id => id > 0 && id !== defaultCategoryId); // Exclude Default Category

        return pathIds.map(id => {
            const cat = categoryMap.get(id);
            return cat ? cat.name : '';
        }).filter(Boolean);
    };

    // Convert categories to the required format
    const formattedCategories = categories
        .filter(cat => cat.is_active &&
            cat.id !== defaultCategoryId)
        .map(category => ({
            label: category.name,
            value: category.id.toString(),
            level: defaultCategoryId ? category.level - 1 : category.level,
            parentId: category.parent_id,
            path: getCategoryPath(category),
            position: category.position
        }));

    // Sort categories by path and position
    return formattedCategories.sort((a, b) => {
        // First compare by path length (depth in tree)
        const pathComparison = a.path.length - b.path.length;
        if (pathComparison !== 0) return pathComparison;

        // If at same level, compare by position
        const catA = categoryMap.get(parseInt(a.value));
        const catB = categoryMap.get(parseInt(b.value));
        return (catA?.position || 0) - (catB?.position || 0);
    });
}


async function getAllCategories(env: Env): Promise<MagentoCategory[]> {
    const response = await fetch(
        `${normalizeUrl(env.MAGENTO_BASE_URL)}/rest/V1/categories/list?searchCriteria[pageSize]=1000&searchCriteria[filterGroups][0][filters][0][field]=is_active&searchCriteria[filterGroups][0][filters][0][value]=1`,
        {
            headers: {
                'Authorization': `Bearer ${env.MAGENTO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    const data: MagentoCategoryResponse = await response.json();
    return data.items;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const env = context.env;
    const logger = new Logger();
    logger.log('Worker started', { method: context.request.method });

    try {
        const categories = await getAllCategories(env);
        const formattedCategories = buildCategoryHierarchy(categories);

        // Add full path to labels
        const categoriesWithFullPath = formattedCategories
            .filter(cat => cat.path.length > 0) // Ensure we have a valid path
            .map(cat => ({
                ...cat,
                label: cat.path.join(' / '),
                fullPath: cat.path.join(' / ')
            }));

        return new Response(JSON.stringify({
            categories: categoriesWithFullPath
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return new Response(JSON.stringify({
            error: `Failed to fetch Magento categories: ${error.message}`
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};
