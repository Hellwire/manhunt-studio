// src/Menu/ActionType.js
import AbstractType from "./AbstractType.js";
import UIError from "../UIError.js";

export default class ActionType extends AbstractType {

    template = `
        <div class="type action" tabindex="0" role="button">
            <span class="type-label"></span>
        </div>
    `;

    /**
     * @type {Function|null}
     */
    callback = null;

    /**
     * @param props {{id:mix, label:string, enabled: boolean, callback: function}}
     */
    constructor(props){
        super(props);

        this.callback = props.callback || null;
        this.applyTemplate(this.template);
    }

    /**
     * @param template {string}
     */
    applyTemplate(template){
        this.element = jQuery(template);

        const labelEl = this.element.find('span');
        labelEl.html(this.label);
        labelEl.css({ display: 'block', width: '100%' });

        this.element.css({ cursor: 'pointer' });

        this.element.on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!this.enabled) return;

            UIError.guard(() => this.triggerClick(), `ActionType "${this.id}" click`);
        });

        this.element.on('keydown', (e) => {
            if (!this.enabled) return;

            const key = e.key || e.keyCode;
            if (key === 'Enter' || key === ' ' || key === 13 || key === 32){
                e.preventDefault();
                e.stopPropagation();

                UIError.guard(() => this.triggerClick(), `ActionType "${this.id}" keydown`);
            }
        });
    }

    triggerClick(){
        if (typeof this.callback === "function"){
            return UIError.guard(
                () => this.callback(this.states),
                `ActionType "${this.id}" callback`
            );
        }
    }
}
