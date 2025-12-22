// src/Menu/Category.js
import UIError from "./UIError.js";

export default class Category {

    id = null;
    enabled = true;

    states = { open: false };

    template = `
        <li>
            <span></span>
            <ul></ul>
        </li>
    `;

    callback = null;

    element = null;
    list = null;

    children = [];
    childrenById = {};

    label = "";

    // used for "only one submenu open"
    menu = null;
    parent = null;

    /**
     * @param props {{id:mix, label: string, enabled:boolean, callback: function }}
     */
    constructor(props){
        this.id = props.id;
        this.enabled = props.enabled === undefined ? true : props.enabled;
        this.label = props.label;
        this.callback = props.callback || null;
        this.states.open = false;

        this.applyTemplate(this.template);
    }

    /**
     * Called by Menu.addCategory and by parents when adding subcategories.
     * @param menu {Menu}
     * @param parent {Category|null}
     */
    attachToMenu(menu, parent){
        this.menu = menu;
        this.parent = parent;

        this.children.forEach((child) => {
            if (child instanceof Category){
                child.attachToMenu(menu, this);
            }
        });
    }

    applyTemplate(template){
        this.element = jQuery(template);

        const labelSpan = this.element.children('span');
        this.list = this.element.children('ul');

        labelSpan.html(this.label);

        labelSpan.css({ display: 'block', width: '100%' });

        this.element.on('click', (e) => {
            if (!this.enabled) return;

            if (this.list && jQuery(e.target).closest(this.list).length > 0){
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            UIError.guard(() => this.triggerClick(), `Category "${this.id}" click`);
        });

        if (this.enabled === false) this.disable();

        this.list.hide();
    }

    triggerClick(){
        if (this.states.open){
            this.close();
            if (this.callback !== null){
                return UIError.guard(() => this.callback(this.states), `Category "${this.id}" callback`);
            }
            return;
        }

        this.closeSiblings();

        this.states.open = true;
        this.list.show();

        if (this.callback !== null){
            return UIError.guard(() => this.callback(this.states), `Category "${this.id}" callback`);
        }
    }

    closeSiblings(){
        if (this.parent === null && this.menu && Array.isArray(this.menu.children)){
            this.menu.children.forEach((cat) => {
                if (cat instanceof Category && cat !== this){
                    cat.close();
                }
            });
            return;
        }

        if (this.parent && Array.isArray(this.parent.children)){
            this.parent.children.forEach((child) => {
                if (child instanceof Category && child !== this){
                    child.close();
                }
            });
        }
    }

    close() {
        if (this.states.open === false) return;

        this.states.open = false;
        this.list.hide();

        this.children.forEach(function (child) {
            if (child instanceof Category){
                child.close();
            }
        });
    }

    clear(){
        this.list.html("");
        this.children = [];
        this.childrenById = {};
    }

    /**
     * @param menuType {AbstractType}
     */
    addType(menuType){
        this.children.push(menuType);
        this.childrenById[menuType.id] = menuType;

        const container = jQuery('<li>');

        if (menuType.enabled === false) menuType.disable();

        if (menuType.element){
            menuType.element.css({ display: 'block', width: '100%' });
        }

        this.list.append(container.append(menuType.element));
    }

    /**
     * @param category {Category}
     */
    addSubCategory(category){
        this.children.push(category);
        this.childrenById[category.id] = category;

        if (typeof category.attachToMenu === "function"){
            category.attachToMenu(this.menu, this);
        }

        category.element.append('<i class="fas fa-angle-right" style="float: right"></i>');
        category.element.find('ul').addClass('sub-category');

        this.list.append(category.element);
    }

    getById(id){
        if (this.childrenById[id] !== undefined){
            return this.childrenById[id];
        }

        let subResult = false;
        this.children.forEach(function (child) {
            if (subResult !== false) return;
            if (child instanceof Category){
                subResult = child.getById(id);
            }
        });

        return subResult;
    }

    enable(){
        this.element.removeClass('disabled');
        this.enabled = true;
    }

    disable(){
        this.element.addClass('disabled');
        this.enabled = false;
    }
}
