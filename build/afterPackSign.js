// electron-builder afterPack hook.
// mac 코드사이닝 인증서(Apple Developer ID)가 없는 상태에서, unsigned 상태로 배포된 .app이
// macOS Gatekeeper/XProtect에 의해 "악성 코드 포함"으로 오탐되는 경우를 줄이기 위해
// ad-hoc 서명(자체 서명, 무료, 인증서 불필요)을 강제로 적용한다.
//
// 주의: ad-hoc 서명은 Apple Developer ID 서명 + 공증(notarization)을 대체하지 않는다.
// "확인되지 않은 개발자" 경고 자체는 계속 뜨며, 사용자는 여전히 control+클릭 후 "열기"로
// 실행해야 한다. 다만 서명이 전혀 없는 상태보다 손상/변조 여부를 macOS가 판별하기 쉬워지고,
// 일부 환경에서 XProtect의 "악성 코드가 포함되어 있어 열리지 않습니다" 오탐 빈도가 줄어든다.
// 완전한 해결은 Apple Developer Program 가입(연 $99) 후 서명 + 공증뿐이다.

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[afterPackSign] ad-hoc 서명 적용 중: ${appPath}`);

  try {
    execFileSync('codesign', [
      '--force',
      '--deep',
      '--sign', '-', // '-' = ad-hoc identity, 인증서 불필요, 무료
      appPath,
    ], { stdio: 'inherit' });

    console.log('[afterPackSign] ad-hoc 서명 완료');
  } catch (err) {
    console.error('[afterPackSign] ad-hoc 서명 실패 (빌드는 계속 진행):', err.message);
  }
};
