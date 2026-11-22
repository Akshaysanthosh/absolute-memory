import { mergeModuleClasses } from './merge-module-classes';
import preview from './content-detail-dialog-preview.module.css';
import layout from './content-detail-dialog-layout.module.css';
import drawer from './content-detail-dialog-drawer.module.css';

export default mergeModuleClasses(preview, layout, drawer);
