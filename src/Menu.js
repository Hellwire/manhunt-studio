// src/Menu/Menu.js
import Components from "./Plugin/Components.js";
import Mouse from "./Mouse.js";
import UIError from "./menu/UIError.js";

export default class Menu{

    element = null;

    /**
     * @type {Category[]}
     */
    children = [];

    constructor(){
        this.element = jQuery('<ul class="menu">');

        let topSection = Components.getSection('top');
        topSection.container.append(this.element);

        // Optional but recommended: one-time global hooks for any uncaught errors
        UIError.installGlobalHooks();

        let _this = this;

        Mouse.onMouseClick(function (e) {
            UIError.guard(() => {
                const el = _this.element.get(0);

                const path = (e && typeof e.composedPath === "function")
                    ? e.composedPath()
                    : (e && e.path ? e.path : null);

                let clickedInside = false;

                if (path && path.length){
                    clickedInside = path.indexOf(el) !== -1;
                }else{
                    clickedInside = jQuery(e.target).closest(_this.element).length > 0;
                }

                if (!clickedInside){
                    _this.closeAll();
                }
            }, "Menu outside-click handler");
        });
    }

    closeAll(){
        UIError.guard(() => {
            this.children.forEach(function (category) {
                category.close();
            });
        }, "Menu.closeAll");
    }

    /**
     * @param category {Category}
     */
    addCategory(category){
        if (this.children.indexOf(category) !== -1)
            return;

        if (typeof category.attachToMenu === "function"){
            category.attachToMenu(this, null);
        }

        this.children.push(category);
        this.element.append(category.element);
    }

    getById(id){
        let found = false;

        this.children.forEach(function (category) {
            if (found !== false) return;

            if (category.id === id){
                found = category;
                return;
            }

            let type = category.getById(id);
            if (type !== false) found = type;
        });

        return found === null ? null : found;
    }

    getStatesById(id){
        let type = this.getById(id);
        return type === null ? null : type.states;
    }
}
