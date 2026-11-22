import { mergeModuleClasses } from './merge-module-classes';
import frame from './workspace-shell-frame.module.css';
import adaptive from './workspace-shell-adaptive.module.css';
import panels from './workspace-shell-panels.module.css';

export default mergeModuleClasses(frame, adaptive, panels);
