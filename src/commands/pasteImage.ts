import { Command } from '../commandManager';
import * as path from 'path';
import { Logger, Paster } from '../image-paste';


export class PasteImage implements Command {
    public readonly id = 'asciidoc.pasteImage';

    public execute() {
        try {
            Paster.paste();
        } catch (e) {
            Logger.showErrorMessage(e)
        }
	}

}