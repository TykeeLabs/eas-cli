import fs from 'fs-extra';
import mockdate from 'mockdate';
import path from 'path';
import { instance, mock } from 'ts-mockito';
import { v4 as uuidv4 } from 'uuid';

import { ExpoGraphqlClient } from '../../commandUtils/context/contextUtils/createGraphqlClient';
import { defaultPublishPlatforms } from '../../commands/update';
import { AssetMetadataStatus } from '../../graphql/generated';
import { PublishMutation } from '../../graphql/mutations/PublishMutation';
import { PublishQuery } from '../../graphql/queries/PublishQuery';
import {
  MetadataJoi,
  buildUnsortedUpdateInfoGroupAsync,
  collectAssetsAsync,
  convertAssetToUpdateInfoGroupFormatAsync,
  filterOutAssetsThatAlreadyExistAsync,
  getBase64URLEncoding,
  getStorageKey,
  getStorageKeyForAssetAsync,
  guessContentTypeFromExtension,
  resolveInputDirectoryAsync,
  uploadAssetsAsync,
} from '../publish';

jest.mock('../../uploads');
jest.mock('fs');

const dummyFileBuffer = Buffer.from('dummy-file');

beforeAll(async () => {
  await fs.mkdir(path.resolve(), { recursive: true });
  await fs.writeFile(path.resolve('md5-hash-of-file'), dummyFileBuffer);
});

afterAll(async () => {
  await fs.remove(path.resolve('md5-hash-of-file'));
});

describe('MetadataJoi', () => {
  it('passes correctly structured metadata', () => {
    const { error } = MetadataJoi.validate({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          assets: [{ path: 'assets/3261e570d51777be1e99116562280926', ext: 'png' }],
          bundle: 'bundles/android.js',
        },
        ios: {
          assets: [{ path: 'assets/3261e570d51777be1e99116562280926', ext: 'png' }],
          bundle: 'bundles/ios.js',
        },
      },
    });
    expect(error).toBe(undefined);
  });
  it('fails if a bundle is missing', () => {
    const { error } = MetadataJoi.validate({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          assets: [{ path: 'assets/3261e570d51777be1e99116562280926', ext: 'png' }],
          bundle: 'bundles/android.js',
        },
        ios: {
          assets: [{ path: 'assets/3261e570d51777be1e99116562280926', ext: 'png' }],
          bundle: undefined,
        },
      },
    });
    expect(error).toBeDefined();
  });
  it('passes metadata with no assets', () => {
    const { error } = MetadataJoi.validate({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          assets: [],
          bundle: 'bundles/android.js',
        },
        ios: {
          assets: [],
          bundle: 'bundles/ios.js',
        },
      },
    });
    expect(error).toBe(undefined);
  });
});

describe(guessContentTypeFromExtension, () => {
  it('returns the correct content type for jpg', () => {
    expect(guessContentTypeFromExtension('jpg')).toBe('image/jpeg');
  });
  it('returns application/octet-stream when an ext is not recognized', () => {
    expect(guessContentTypeFromExtension('does-not-exist')).toBe('application/octet-stream');
  });
  it('returns application/octet-stream when an ext is undefined', () => {
    expect(guessContentTypeFromExtension(undefined)).toBe('application/octet-stream');
  });
});

describe(getBase64URLEncoding, () => {
  it('computes the correct encoding', () => {
    expect(getBase64URLEncoding(Buffer.from('test-string'))).toBe('dGVzdC1zdHJpbmc');
  });
});

describe(getStorageKey, () => {
  it('computes the correct key', () => {
    const key = getStorageKey('image/jpeg', 'blibblab');
    expect(key).toBe('j0iiW9hDbR2HKoH1nCxsKRM6QIZVtZ__2ssOiOcxlAs');
  });
  it('uses the null separator to distinguish unequal keys', () => {
    const keyOne = getStorageKey('image/jpeg', 'blibblab');
    const keyTwo = getStorageKey('image', '/jpegblibblab');
    expect(keyOne).not.toBe(keyTwo);
  });
});

describe(getStorageKeyForAssetAsync, () => {
  const pathLocation = uuidv4();
  beforeAll(async () => {
    await fs.writeFile(pathLocation, Buffer.from('I am pretending to be a jpeg'));
  });
  afterAll(async () => {
    await fs.remove(pathLocation);
  });
  it('returns the correct key', async () => {
    const asset = {
      type: 'jpg',
      contentType: 'image/jpeg',
      path: pathLocation,
    };
    expect(await getStorageKeyForAssetAsync(asset)).toBe(
      'fo8Y08LktVk6qLtGbn8GRWpOUyD13ABMUnbtRCN1L7Y'
    );
  });
});

describe(convertAssetToUpdateInfoGroupFormatAsync, () => {
  const pathLocation = uuidv4();
  beforeAll(async () => {
    await fs.writeFile(pathLocation, Buffer.from('I am pretending to be a jpeg'));
  });
  afterAll(async () => {
    await fs.remove(pathLocation);
  });
  it('resolves to the correct value', async () => {
    const fileExtension = '.jpg';
    const asset = {
      fileExtension,
      contentType: 'image/jpeg',
      path: pathLocation,
    };
    await expect(convertAssetToUpdateInfoGroupFormatAsync(asset)).resolves.toEqual({
      bundleKey: 'c939e759656f577c058f445bfb19182e',
      fileExtension: '.jpg',
      contentType: 'image/jpeg',
      fileSHA256: 'tzD6J-OQZaHCKnL3GHWV9RbnrpyojnagiOE7r3mSkU4',
      storageKey: 'fo8Y08LktVk6qLtGbn8GRWpOUyD13ABMUnbtRCN1L7Y',
    });
  });
});

describe(buildUnsortedUpdateInfoGroupAsync, () => {
  const androidBundlePath = uuidv4();
  const assetPath = uuidv4();

  beforeAll(async () => {
    await fs.writeFile(androidBundlePath, 'I am a js bundle');
    await fs.writeFile(assetPath, 'I am pretending to be a jpeg');
  });
  afterAll(async () => {
    await fs.remove(androidBundlePath);
    await fs.remove(assetPath);
  });

  it('returns the correct value', async () => {
    await expect(
      buildUnsortedUpdateInfoGroupAsync(
        {
          android: {
            launchAsset: {
              fileExtension: '.bundle',
              contentType: 'bundle/javascript',
              path: androidBundlePath,
            },
            assets: [
              {
                fileExtension: '.jpg',
                contentType: 'image/jpeg',
                path: assetPath,
              },
            ],
          },
        },
        {
          slug: 'hello',
          name: 'hello',
        }
      )
    ).resolves.toEqual({
      android: {
        assets: [
          {
            bundleKey: 'c939e759656f577c058f445bfb19182e',
            fileExtension: '.jpg',
            contentType: 'image/jpeg',
            fileSHA256: 'tzD6J-OQZaHCKnL3GHWV9RbnrpyojnagiOE7r3mSkU4',
            storageKey: 'fo8Y08LktVk6qLtGbn8GRWpOUyD13ABMUnbtRCN1L7Y',
          },
        ],
        launchAsset: {
          bundleKey: 'ec0dd14670aae108f99a810df9c1482c',
          fileExtension: '.bundle',
          contentType: 'bundle/javascript',
          fileSHA256: 'KEw79FnKTLOyVbRT1SlohSTjPe5e8FpULy2ST-I5BUg',
          storageKey: 'aC9N6RZlcHoIYjIsoJd2KUcigBKy98RHvZacDyPNjCQ',
        },
        extra: {
          expoClient: {
            slug: 'hello',
            name: 'hello',
          },
        },
      },
    });
  });
});

describe(resolveInputDirectoryAsync, () => {
  it('returns the correct distRoot path', async () => {
    const customDirectoryName = path.resolve(uuidv4());
    await fs.mkdir(customDirectoryName, { recursive: true });
    expect(await resolveInputDirectoryAsync(customDirectoryName)).toBe(customDirectoryName);
  });
  it('throws an error if the path does not exist', async () => {
    const nonExistentPath = path.resolve(uuidv4());
    await expect(resolveInputDirectoryAsync(nonExistentPath)).rejects
      .toThrow(`The input directory "${nonExistentPath}" does not exist.
    You can allow us to build it for you by not setting the --skip-bundler flag.
    If you chose to build it yourself you'll need to run a command to build the JS
    bundle first.
    You can use '--input-dir' to specify a different input directory.`);
  });
});

describe(collectAssetsAsync, () => {
  it('builds an update info group', async () => {
    const fakeHash = 'md5-hash-of-jpg';
    const bundles = { android: 'android-bundle-code', ios: 'ios-bundle-code' };
    const inputDir = uuidv4();

    const userDefinedAssets = [
      {
        fileExtension: '.jpg',
        contentType: 'image/jpeg',
        path: path.resolve(`${inputDir}/assets/${fakeHash}`),
      },
    ];

    const bundleDir = path.resolve(`${inputDir}/bundles`);
    const assetDir = path.resolve(`${inputDir}/assets`);
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.mkdir(assetDir, { recursive: true });
    for (const platform of defaultPublishPlatforms) {
      await fs.writeFile(path.resolve(inputDir, `bundles/${platform}.js`), bundles[platform]);
    }
    await fs.writeFile(path.resolve(`${inputDir}/assets/${fakeHash}`), dummyFileBuffer);
    await fs.writeFile(
      path.resolve(inputDir, 'metadata.json'),
      JSON.stringify({
        version: 0,
        bundler: 'metro',
        fileMetadata: {
          android: {
            assets: [{ path: `assets/${fakeHash}`, ext: 'jpg' }],
            bundle: 'bundles/android.js',
          },
          ios: {
            assets: [{ path: `assets/${fakeHash}`, ext: 'jpg' }],
            bundle: 'bundles/ios.js',
          },
        },
      })
    );

    expect(await collectAssetsAsync({ inputDir, platforms: defaultPublishPlatforms })).toEqual({
      android: {
        launchAsset: {
          fileExtension: '.bundle',
          contentType: 'application/javascript',
          path: path.resolve(`${inputDir}/bundles/android.js`),
        },
        assets: userDefinedAssets,
      },
      ios: {
        launchAsset: {
          fileExtension: '.bundle',
          contentType: 'application/javascript',
          path: path.resolve(`${inputDir}/bundles/ios.js`),
        },
        assets: userDefinedAssets,
      },
    });

    expect(await collectAssetsAsync({ inputDir, platforms: ['ios'] })).toEqual({
      ios: {
        launchAsset: {
          fileExtension: '.bundle',
          contentType: 'application/javascript',
          path: path.resolve(`${inputDir}/bundles/ios.js`),
        },
        assets: userDefinedAssets,
      },
    });
  });
});

describe(filterOutAssetsThatAlreadyExistAsync, () => {
  it('gets a missing asset', async () => {
    const graphqlClient = instance(mock<ExpoGraphqlClient>());
    jest.spyOn(PublishQuery, 'getAssetMetadataAsync').mockImplementation(async () => {
      return [
        {
          storageKey: 'blah',
          status: AssetMetadataStatus.DoesNotExist,
          __typename: 'AssetMetadataResult',
        },
      ];
    });

    expect(
      (await filterOutAssetsThatAlreadyExistAsync(graphqlClient, [{ storageKey: 'blah' } as any]))
        .length
    ).toBe(1);
  });
  it('ignores an asset that exists', async () => {
    const graphqlClient = instance(mock<ExpoGraphqlClient>());
    jest.spyOn(PublishQuery, 'getAssetMetadataAsync').mockImplementation(async () => {
      return [
        {
          storageKey: 'blah',
          status: AssetMetadataStatus.Exists,
          __typename: 'AssetMetadataResult',
        },
      ];
    });

    expect(
      (await filterOutAssetsThatAlreadyExistAsync(graphqlClient, [{ storageKey: 'blah' } as any]))
        .length
    ).toBe(0);
  });
});

describe(uploadAssetsAsync, () => {
  const publishBundles = {
    android: {
      code: 'android bundle code',
      assets: [{ files: ['md5-hash-of-file'], type: 'jpg' }],
      map: 'dummy-string',
    },
    ios: {
      code: 'ios bundle code',
      assets: [{ files: ['md5-hash-of-file'], type: 'jpg' }],
      map: 'dummy-string',
    },
  };

  const androidBundlePath = uuidv4();
  const iosBundlePath = uuidv4();
  const dummyFilePath = uuidv4();
  const userDefinedPath = uuidv4();
  const testProjectId = uuidv4();
  const expectedAssetLimit = 1400;

  const userDefinedAsset = {
    type: 'bundle',
    contentType: 'application/octet-stream',
    path: userDefinedPath,
  };

  const assetsForUpdateInfoGroup = {
    android: {
      launchAsset: {
        type: 'bundle',
        contentType: 'application/javascript',
        path: androidBundlePath,
      },
      assets: [userDefinedAsset, { type: 'jpg', contentType: 'image/jpeg', path: dummyFilePath }],
    },
    ios: {
      launchAsset: {
        type: 'bundle',
        contentType: 'application/javascript',
        path: androidBundlePath,
      },
      assets: [userDefinedAsset, { type: 'jpg', contentType: 'image/jpeg', path: dummyFilePath }],
    },
  };

  beforeAll(async () => {
    await fs.writeFile(androidBundlePath, publishBundles.android.code);
    await fs.writeFile(iosBundlePath, publishBundles.ios.code);
    await fs.writeFile(dummyFilePath, dummyFileBuffer);
    await fs.writeFile(userDefinedPath, 'I am an octet stream');
  });

  afterAll(async () => {
    await fs.remove(androidBundlePath);
    await fs.remove(iosBundlePath);
    await fs.remove(dummyFilePath);
    await fs.remove(userDefinedPath);
  });

  jest.spyOn(PublishMutation, 'getUploadURLsAsync').mockImplementation(async () => {
    return { specifications: ['{}', '{}', '{}'] };
  });

  jest
    .spyOn(PublishQuery, 'getAssetLimitPerUpdateGroupAsync')
    .mockImplementation(async () => expectedAssetLimit);

  it('resolves if the assets are already uploaded', async () => {
    const graphqlClient = instance(mock<ExpoGraphqlClient>());
    jest.spyOn(PublishQuery, 'getAssetMetadataAsync').mockImplementation(async () => {
      const status = AssetMetadataStatus.Exists;
      jest.runAllTimers();
      return [
        {
          storageKey: 'qbgckgkgfdjnNuf9dQd7FDTWUmlEEzg7l1m1sKzQaq0',
          status,
          __typename: 'AssetMetadataResult',
        }, // userDefinedAsset
        {
          storageKey: 'bbjgXFSIXtjviGwkaPFY0HG4dVVIGiXHAboRFQEqVa4',
          status,
          __typename: 'AssetMetadataResult',
        }, // android.code
        {
          storageKey: 'dP-nC8EJXKz42XKh_Rc9tYxiGAT-ilpkRltEi6HIKeQ',
          status,
          __typename: 'AssetMetadataResult',
        }, // ios.code
      ];
    });

    mockdate.set(0);
    await expect(
      uploadAssetsAsync(graphqlClient, assetsForUpdateInfoGroup, testProjectId)
    ).resolves.toEqual({
      assetCount: 6,
      uniqueAssetCount: 3,
      uniqueUploadedAssetCount: 0,
      assetLimitPerUpdateGroup: expectedAssetLimit,
    });
  });
  it('resolves if the assets are eventually uploaded', async () => {
    const graphqlClient = instance(mock<ExpoGraphqlClient>());
    jest.spyOn(PublishQuery, 'getAssetMetadataAsync').mockImplementation(async () => {
      const status =
        Date.now() === 0 ? AssetMetadataStatus.DoesNotExist : AssetMetadataStatus.Exists;
      mockdate.set(Date.now() + 1);
      jest.runAllTimers();
      return [
        {
          storageKey: 'qbgckgkgfdjnNuf9dQd7FDTWUmlEEzg7l1m1sKzQaq0',
          status,
          __typename: 'AssetMetadataResult',
        }, // userDefinedAsset
        {
          storageKey: 'bbjgXFSIXtjviGwkaPFY0HG4dVVIGiXHAboRFQEqVa4',
          status,
          __typename: 'AssetMetadataResult',
        }, // android.code
        {
          storageKey: 'dP-nC8EJXKz42XKh_Rc9tYxiGAT-ilpkRltEi6HIKeQ',
          status,
          __typename: 'AssetMetadataResult',
        }, // ios.code
      ];
    });

    mockdate.set(0);
    await expect(
      uploadAssetsAsync(graphqlClient, assetsForUpdateInfoGroup, testProjectId)
    ).resolves.toEqual({
      assetCount: 6,
      uniqueAssetCount: 3,
      uniqueUploadedAssetCount: 2,
      assetLimitPerUpdateGroup: expectedAssetLimit,
    });
  });

  it('updates spinner text throughout execution', async () => {
    const graphqlClient = instance(mock<ExpoGraphqlClient>());
    jest.spyOn(PublishQuery, 'getAssetMetadataAsync').mockImplementation(async () => {
      const status =
        Date.now() === 0 ? AssetMetadataStatus.DoesNotExist : AssetMetadataStatus.Exists;
      mockdate.set(Date.now() + 1);
      jest.runAllTimers();
      return [
        {
          storageKey: 'qbgckgkgfdjnNuf9dQd7FDTWUmlEEzg7l1m1sKzQaq0',
          status,
          __typename: 'AssetMetadataResult',
        }, // userDefinedAsset
        {
          storageKey: 'bbjgXFSIXtjviGwkaPFY0HG4dVVIGiXHAboRFQEqVa4',
          status,
          __typename: 'AssetMetadataResult',
        }, // android.code
        {
          storageKey: 'dP-nC8EJXKz42XKh_Rc9tYxiGAT-ilpkRltEi6HIKeQ',
          status,
          __typename: 'AssetMetadataResult',
        }, // ios.code
      ];
    });
    const updateSpinnerFn = jest.fn((_totalAssets, _missingAssets) => {});

    mockdate.set(0);
    await uploadAssetsAsync(
      graphqlClient,
      assetsForUpdateInfoGroup,
      testProjectId,
      updateSpinnerFn
    );
    const calls = updateSpinnerFn.mock.calls;
    expect(calls).toEqual([
      [3, 3],
      [3, 2],
      [3, 0],
    ]);
  });
});
