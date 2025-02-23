import { Platform } from '@expo/eas-build-job';
import fs from 'fs-extra';
import { vol } from 'memfs';

import { EasJsonAccessor } from '../accessor';
import { InvalidEasJsonError } from '../errors';
import { EasJsonUtils } from '../utils';

jest.mock('fs');

beforeEach(async () => {
  vol.reset();
  await fs.mkdirp('/project');
});

test('minimal valid eas.json for both platforms', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: {},
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const iosProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.IOS, 'production');
  const androidProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'production'
  );

  expect(androidProfile).toEqual({
    distribution: 'store',
    credentialsSource: 'remote',
  });

  expect(iosProfile).toEqual({
    distribution: 'store',
    credentialsSource: 'remote',
  });
});

test('valid eas.json for development client builds', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: {},
      debug: {
        developmentClient: true,
        android: {
          withoutCredentials: true,
        },
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const iosProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.IOS, 'debug');
  const androidProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'debug'
  );
  expect(androidProfile).toEqual({
    credentialsSource: 'remote',
    distribution: 'store',
    developmentClient: true,
    withoutCredentials: true,
  });

  expect(iosProfile).toEqual({
    credentialsSource: 'remote',
    distribution: 'store',
    developmentClient: true,
  });
});

test(`valid eas.json with autoIncrement flag at build profile root`, async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: {
        autoIncrement: true,
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const iosProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.IOS, 'production');
  const androidProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'production'
  );
  expect(androidProfile).toEqual({
    autoIncrement: true,
    credentialsSource: 'remote',
    distribution: 'store',
  });

  expect(iosProfile).toEqual({
    autoIncrement: true,
    credentialsSource: 'remote',
    distribution: 'store',
  });
});

test('valid profile for internal distribution on Android', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      internal: {
        distribution: 'internal',
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const profile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'internal');
  expect(profile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',
  });
});

test('valid profile extending other profile', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      base: {
        node: '12.0.0',
      },
      extension: {
        extends: 'base',
        distribution: 'internal',
        node: '13.0.0',
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const baseProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'base');
  const extendedProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'extension'
  );
  expect(baseProfile).toEqual({
    distribution: 'store',
    credentialsSource: 'remote',
    node: '12.0.0',
  });
  expect(extendedProfile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',
    node: '13.0.0',
  });
});

test('valid profile extending other profile with platform specific envs', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      base: {
        env: {
          BASE_ENV: '1',
          PROFILE: 'base',
        },
      },
      extension: {
        extends: 'base',
        distribution: 'internal',
        env: {
          PROFILE: 'extension',
        },
        android: {
          env: {
            PROFILE: 'extension:android',
          },
        },
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const baseProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'base');
  const extendedAndroidProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'extension'
  );
  const extendedIosProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.IOS,
    'extension'
  );
  expect(baseProfile).toEqual({
    distribution: 'store',
    credentialsSource: 'remote',
    env: {
      BASE_ENV: '1',
      PROFILE: 'base',
    },
  });
  expect(extendedAndroidProfile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',
    env: {
      BASE_ENV: '1',
      PROFILE: 'extension:android',
    },
  });
  expect(extendedIosProfile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',
    env: {
      BASE_ENV: '1',
      PROFILE: 'extension',
    },
  });
});

test('valid profile extending other profile with platform specific caching', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      base: {
        cache: {
          disabled: true,
        },
      },
      extension: {
        extends: 'base',
        distribution: 'internal',
        cache: {
          key: 'extend-key',
        },
        android: {
          cache: {
            cacheDefaultPaths: false,
            customPaths: ['somefakepath'],
          },
        },
      },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const baseProfile = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'base');
  const extendedAndroidProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.ANDROID,
    'extension'
  );
  const extendedIosProfile = await EasJsonUtils.getBuildProfileAsync(
    accessor,
    Platform.IOS,
    'extension'
  );
  expect(baseProfile).toEqual({
    distribution: 'store',
    credentialsSource: 'remote',
    cache: {
      disabled: true,
    },
  });
  expect(extendedAndroidProfile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',
    cache: {
      cacheDefaultPaths: false,
      customPaths: ['somefakepath'],
    },
  });
  expect(extendedIosProfile).toEqual({
    distribution: 'internal',
    credentialsSource: 'remote',

    cache: {
      key: 'extend-key',
    },
  });
});

test('valid eas.json with missing profile', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: {},
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const promise = EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'debug');
  await expect(promise).rejects.toThrowError('Missing build profile in eas.json: debug');
});

test('invalid eas.json when using wrong buildType', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: { android: { buildType: 'archive' } },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const promise = EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'production');
  await expect(promise).rejects.toThrowError(InvalidEasJsonError);
  await expect(promise).rejects.toThrowError(
    /.*eas\.json.* is not valid\.\r?\n- "build.production.android.buildType" must be one of \[apk, app-bundle\]$/g
  );
});

test('empty json', async () => {
  await fs.writeJson('/project/eas.json', {});

  const accessor = new EasJsonAccessor('/project');
  const promise = EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'production');
  await expect(promise).rejects.toThrowError('Missing build profile in eas.json: production');
});

test('invalid semver value', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: { node: 'alpha' },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const promise = EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'production');
  await expect(promise).rejects.toThrowError(InvalidEasJsonError);
  await expect(promise).rejects.toThrowError(
    /.*eas\.json.* is not valid\.\r?\n- "build.production.node" failed custom validation because alpha is not a valid version$/g
  );
});

test('invalid release channel', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: { releaseChannel: 'feature/myfeature' },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const promise = EasJsonUtils.getBuildProfileAsync(accessor, Platform.ANDROID, 'production');
  await expect(promise).rejects.toThrowError(/fails to match the required pattern/);
});

test('get profile names', async () => {
  await fs.writeJson('/project/eas.json', {
    build: {
      production: { node: '12.0.0-alpha' },
      blah: { node: '12.0.0' },
    },
  });

  const accessor = new EasJsonAccessor('/project');
  const allProfileNames = await EasJsonUtils.getBuildProfileNamesAsync(accessor);
  expect(allProfileNames.sort()).toEqual(['blah', 'production'].sort());
});
