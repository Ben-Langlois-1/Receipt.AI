const native = platform => [{ from: `resources/native/${platform}-\${arch}`, to: `native/${platform}-\${arch}` }]
module.exports = {
  appId: 'edu.receiptai.desktop', productName: 'Receipt.AI', executableName: 'receipt-ai',
  directories: { output: 'release', buildResources: 'resources' },
  asar: true, npmRebuild: false, compression: 'normal',
  toolsets: { appimage: '1.0.3', wine: '1.0.1' },
  files: ['dist/**/*', 'desktop/**/*', 'package.json', '!**/*.map'],
  extraResources: [
    { from: 'resources/models/Qwen3-1.7B-Q4_K_M.gguf', to: 'models/Qwen3-1.7B-Q4_K_M.gguf' },
    { from: 'resources/licenses', to: 'licenses' },
  ],
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  linux: { target: ['AppImage', 'rpm'], category: 'Finance', icon: 'resources/icon.png', maintainer: 'Receipt.AI project team', syncDesktopName: true, extraResources: native('linux') },
  rpm: { depends: ['gtk3', 'nss', 'libXScrnSaver', 'libXtst', 'libnotify', 'at-spi2-core', 'libdrm', 'mesa-libgbm', 'alsa-lib'] },
  win: { target: ['nsis'], icon: 'resources/icon.ico', extraResources: native('win32') },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  mac: { target: ['dmg', 'zip'], category: 'public.app-category.finance', icon: 'resources/icon.png', hardenedRuntime: true, entitlements: 'desktop/entitlements.mac.plist', extraResources: native('darwin') },
  dmg: { writeUpdateInfo: false },
  publish: null,
}
