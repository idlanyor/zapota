// GoBiz Partner Developer Auth Manager
import fs from "fs";

export function getDeveloperTokens() {
    try {
        const raw = fs.readFileSync("/tmp/developer_auth.json", "utf-8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
