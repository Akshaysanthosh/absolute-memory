export function mergeModuleClasses(...sections: Record<string, string>[]) {
  const classes: Record<string, string> = {};
  for (const section of sections) {
    for (const [name, scopedClass] of Object.entries(section)) {
      const previous = classes[name];
      classes[name] = previous ? `${previous} ${scopedClass}` : scopedClass;
    }
  }
  return classes;
}
