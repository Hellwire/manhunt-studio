// src/Component/GlgEditor.js
import Event from "./../Event.js";
import {default as GlgEditorComponent} from "../Plugin/Component/GlgEditor.js";
import Studio from "../Studio.js";

export default class GlgEditor {

    /**
     * @param section {ComponentSection}
     */
    constructor(section){
        this.section = section;

        this.component = new GlgEditorComponent({});
        this.section.add(this.component);

        let _this = this;

        Event.on(Event.VIEW_ENTRY, function (props) {
            const entry = props?.entry;

            // Always clear if no entry
            if (!entry){
                _this.setEntry(null);
                return;
            }

            // Forward more types (entity selection uses Studio.ENTITY)
            if (
                entry.type === Studio.MODEL ||
                entry.type === Studio.ENTITY ||
                entry.type === Studio.INST
            ){
                _this.setEntry(entry);
            }else{
                // optional: clear for other selections
                _this.setEntry(null);
            }
        });
    }

    /**
     * @param entry {Result|null}
     */
    setEntry(entry){
        this.component.setEntry(entry);
    }
}
