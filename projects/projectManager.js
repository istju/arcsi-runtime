// projects/projectManager.js - Projekt kontextus kezelés
const fs = require('fs');
const path = require('path');

class ProjectManager {
    constructor(workDir) {
        this.workDir = workDir;
        this.projectsRoot = path.join(workDir, 'projects');
        this.activeFile = path.join(this.projectsRoot, 'active_project.json');
    }

    /**
     * Visszaadja az aktív projekt kontextusát
     * @returns {Object|null} Projekt kontextus vagy null
     */
    getActiveProject() {
        if (!fs.existsSync(this.activeFile)) {
            return null;
        }

        try {
            const active = JSON.parse(fs.readFileSync(this.activeFile, 'utf8'));
            const contextFile = path.join(active.path, 'context.json');
            
            if (!fs.existsSync(contextFile)) {
                return null;
            }

            const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
            context.project_path = active.path;
            context.project_name = active.name;
            return context;
        } catch (err) {
            console.error('Hiba az aktív projekt betöltésekor:', err.message);
            return null;
        }
    }

    /**
     * Visszaadja az aktív projekt system prompt-ját (vagy alapértelmezettet)
     * @returns {string|null}
     */
    getSystemPrompt() {
        const project = this.getActiveProject();
        if (project && project.system_prompt) {
            return project.system_prompt;
        }
        return null;
    }

    /**
     * Visszaadja az aktív projekt szabályait
     * @returns {Array}
     */
    getRules() {
        const project = this.getActiveProject();
        if (project && project.rules) {
            return project.rules;
        }
        return [];
    }

    /**
     * Projekt neve
     * @returns {string|null}
     */
    getProjectName() {
        const project = this.getActiveProject();
        return project ? project.project_name : null;
    }

    /**
     * Projekt munkakönyvtárának elérési útja
     * @returns {string|null}
     */
    getProjectWorkDir() {
        const project = this.getActiveProject();
        return project ? project.project_path : null;
    }

    /**
     * Aktív projekt van-e beállítva
     * @returns {boolean}
     */
    hasActiveProject() {
        return this.getActiveProject() !== null;
    }
}

module.exports = ProjectManager;
