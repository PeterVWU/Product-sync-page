import { Env } from "./backendTypes";
import Logger from './logger';

interface EnvBind extends Env {
    PRODUCT_SYNC_LOGS: KVNamespace;
}

export const onRequestGet: PagesFunction<EnvBind> = async (context) => {
    try {
        const { searchParams } = new URL(context.request.url);
        const date = searchParams.get('date'); // Optional date parameter

        const logs = await Logger.retrieveLogs(context.env.PRODUCT_SYNC_LOGS, date);

        return new Response(JSON.stringify({
            success: true,
            logs
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: (error as Error).message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};