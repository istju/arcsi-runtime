// Config settings modul
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SETTINGS = {
    PORT: process.env.PORT || 3000,
    LOG_DIR: path.join(__dirname, '..', 'chat_logs'),
    WORK_DIR: path.join(__dirname, '..'),
    DEFAULT_PROVIDER_NUM: process.env.DEFAULT_PROVIDER_NUM || '10',
    LOG_RETENTION_DAYS: 7,
    MAX_FILE_SIZE: 10 * 1024 * 1024,
    MAX_OUTPUT_SIZE: 100000,
    MAX_HISTORY_LEN: 100,
    MAX_AGENT_STEPS: 20,
    TOOL_TIMEOUT_MS: 30000,
    MONITORING_ENABLED: process.env.MONITORING_ENABLED === 'true',
    MONITORING_INTERVAL_MS: 5 * 60 * 1000,
    MONITORING_MEM_THRESHOLD_PERCENT: 85,
    MONITORING_CPU_LOAD_THRESHOLD: 4.0
};

module.exports = SETTINGS;
