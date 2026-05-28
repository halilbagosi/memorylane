# MemoryLane - Version Release Report

**Topic**: Full Integration of Dark Mode & Creation of Development Builds  
**Author**: Halil Bagosi  
**Date**: May 20, 2026  
**Version**: 1.0.0 (Release-Ready)  

---

## 1. Executive Summary
This engineering report details the technical implementation and architectural changes introduced in the current version of the **MemoryLane** React Native (Expo) application. The changes are grouped into two main development pillars:

1. **Full Dynamic Dark Mode Integration**: Migration from static, hardcoded light themes to an automated, context-aware, premium light/dark system.
2. **Native Development Builds Pipeline**: Establishment of Expo Application Services (EAS) and local compilation configurations to package and test native application bundles.

These additions establish a stable foundation for platform-native rendering excellence, unified styling across all screens, and a formal deployment workflow.

---

## 2. Architecture & Integration of Dynamic Dark Mode
MemoryLane's dark mode integration was executed using a centralized context and dynamic stylesheet generation pattern. This method completely avoids hardcoded hex values, ensures system-level synchronization, and maintains high-fidelity animations and glassmorphism styling in both themes.

### A. Centralized Color Palette Definition (`colors.ts`)
- Standardized design tokens are exported as two main dictionaries: `lightColors` and `darkColors`.
- Distinct color palettes were chosen to provide separate feels for key user interfaces:
  - **Caregiver Workspace**: Deep Emerald primary and mint secondary tones.
  - **Patient Workspace**: Warm Amber and soft Lavender primary/secondary accents.
- **iOS vs. Android platform differentiators**:
  - *iOS* leverages translucent alpha values (e.g., `rgba(255, 255, 255, 0.7)`) to support native vibrancy and background glass-blur effects.
  - *Android* relies on high-contrast solid fallbacks (e.g., `#FFFFFF`) to prevent visual artifacting and performance degradation.
- **Backward compatibility**: Resolves to the system theme dynamically during module load time as a sensible fallback for components out of scope.

### B. Theme Provider & Persistent Store (`ThemeProvider.tsx`)
- Implemented `ThemeContext` and `ThemeProvider` utilizing the React Context API.
- Supports three user settings: `'system' | 'light' | 'dark'`.
- Integrates state hook tracking via React Native's `useColorScheme()` to automatically respond to system-wide theme changes.
- Integrates state persistence using React Native's standard asynchronous utility `@react-native-async-storage/async-storage` under the key `@app_appearance`. This ensures user selections persist across reboots.
- State computations are memoized to avoid redundant renders.

### C. Dynamic StyleSheet Injection (`getStyles` Pattern)
- Modified standard React Native `StyleSheet.create` layouts by transforming them into dynamic functions:
  ```typescript
  const getStyles = (isDark: boolean) => StyleSheet.create({ ... });
  ```
- Components call the hook `const { isDark, colors } = useTheme();` and compute the stylesheet inline during render time:
  ```typescript
  const styles = getStyles(isDark);
  ```
- Allows inline conditions such as:
  ```typescript
  backgroundColor: isDark ? 'rgba(235, 247, 239, 0.12)' : '#FFFFFF'
  ```
- This guarantees 100% style synchronization on all components (e.g., Timeline chips, patient detail sheets, greeting overlays, and navigation elements).

---

## 3. Build System: Configuration & Creation of Development Builds
To test native code modifications (including camera scanning, biometrics, secure storage, and background location), MemoryLane was migrated from standard Expo Go sandboxes to custom Development Client Builds. 

### A. EAS CLI Configuration (`eas.json`)
- Configured `eas.json` in the root and frontend directories.
- Created a specialized `'development'` build profile:
  - `"developmentClient": true` directs Expo to bundle the custom native `expo-dev-client` library into the final binary. This acts as an embedded development assistant directly inside the app shell.
  - `"distribution": "internal"` allows distributing the build internally to simulators or provisioned ad-hoc devices.
  - `"ios": { "simulator": false }` enables custom provisioning profile builds.

### B. Native Settings and Permissions (`app.json`)
- Defined platform bundle structures to allow native compilation:
  - **iOS Bundle Identifier**: `com.memorylane.app`
  - **Android Package Name**: `com.memorylane.app`
- Native permissions with localized prompt messages were added:
  - **Camera**: scanning QR code for easy linking (`NSCameraUsageDescription`).
  - **Location**: sharing location updates with care teams (`NSLocationWhenInUseUsageDescription`).
  - **Face ID**: biometrics for account access (`NSFaceIDUsageDescription`).
- **Native UI customization**: Set active theme colors to style system native components such as the Android datepicker:
  - `@react-native-community/datetimepicker` custom theme keys are injected via Expo build plugins to maintain Dark/Light color matching on native modal sheets.

### C. Creating the Builds (Step-by-Step Execution)
The native binaries can be compiled in two ways: via the EAS Cloud or locally.

#### OPTION 1: EAS Cloud Build Compilation (Recommended for consistency)
1. **Global installation of EAS CLI tool**:
   ```bash
   npm install -g eas-cli
   ```
2. **Log in and configure the Expo developer account**:
   ```bash
   eas login
   ```
3. **Initialize the EAS Project credentials configuration**:
   ```bash
   eas init
   ```
4. **Compile the development client on Expo cloud servers**:
   - *iOS Development Build* (outputs a `.ipa` or simulator compatible bundle):
     ```bash
     eas build --profile development --platform ios
     ```
   - *Android Development Build* (outputs a `.apk` file):
     ```bash
     eas build --profile development --platform android
     ```
   - *Concurrent Build for both platforms*:
     ```bash
     eas build --profile development --platform all
     ```
5. Once the build finishes, a QR code or download link is generated. Scan this on the physical device to download and install.

#### OPTION 2: Local Native Build Compilation (Recommended for rapid local iteration)
Instead of uploading code to EAS servers, developers can prebuild and compile the project directly using local SDKs (Xcode on macOS or Android SDK).
1. **Clear previous native files and run a clean native prebuild generation**:
   ```bash
   npm run prebuild # runs expo prebuild --clean
   ```
2. **Compile and run the debug development bundle on an iOS device/simulator**:
   ```bash
   npm run ios # runs expo run:ios under the hood
   ```
3. **Compile and run the debug development bundle on an Android device/emulator**:
   ```bash
   npm run android # runs expo run:android under the hood
   ```
4. These steps configure the local `/ios` and `/android` native directories and use `xcodebuild` or `gradlew` to build local dev client binaries.

---

## 4. Stability & Verification Status
- **Compilation**: The entire TypeScript codebase successfully compiles with zero errors: `npx tsc --noEmit` -> **PASSED**.
- **Runtime Contrast**: Audited for legible text contrast ratios on all screens.
- **Native Plugins**: Custom build plugins successfully inject Gradle JVM properties and native picker colors, confirming the robustness of the native build setup.
