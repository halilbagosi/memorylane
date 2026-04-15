const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MACOS_AS_JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';

/**
 * Gradle + CMake on native modules fails on JDK 24+ with:
 * "WARNING: A restricted method in java.lang.System has been called"
 * Android tooling expects JDK 17 or 21. On macOS, Android Studio ships a suitable JBR.
 */
function withAndroidGradleJvm(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      if (process.platform !== 'darwin') {
        return cfg;
      }
      const javaHome = path.join(MACOS_AS_JBR, 'bin', 'java');
      if (!fs.existsSync(javaHome)) {
        return cfg;
      }
      const gradlePropsPath = path.join(cfg.modRequest.platformProjectRoot, 'gradle.properties');
      let contents = fs.readFileSync(gradlePropsPath, 'utf8');
      if (contents.includes('org.gradle.java.home=')) {
        return cfg;
      }
      const block = `
# Use Android Studio's JDK 21 for Gradle (avoid JDK 24 CMake failures). Plugin: withAndroidGradleJvm
org.gradle.java.home=${MACOS_AS_JBR}
`;
      fs.writeFileSync(gradlePropsPath, contents.trimEnd() + block, 'utf8');
      return cfg;
    },
  ]);
}

module.exports = withAndroidGradleJvm;
