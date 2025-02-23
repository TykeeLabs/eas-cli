import gql from 'graphql-tag';

import { ExpoGraphqlClient } from '../../commandUtils/context/contextUtils/createGraphqlClient';
import { withErrorHandlingAsync } from '../client';
import {
  CodeSigningInfoInput,
  GetSignedUploadMutation,
  GetSignedUploadMutationVariables,
  PublishUpdateGroupInput,
  SetCodeSigningInfoMutation,
  UpdatePublishMutation,
} from '../generated';

export const PublishMutation = {
  async getUploadURLsAsync(
    graphqlClient: ExpoGraphqlClient,
    contentTypes: string[]
  ): Promise<GetSignedUploadMutation['asset']['getSignedAssetUploadSpecifications']> {
    const data = await withErrorHandlingAsync(
      graphqlClient
        .mutation<GetSignedUploadMutation, GetSignedUploadMutationVariables>(
          gql`
            mutation GetSignedUploadMutation($contentTypes: [String!]!) {
              asset {
                getSignedAssetUploadSpecifications(assetContentTypes: $contentTypes) {
                  specifications
                }
              }
            }
          `,
          {
            contentTypes,
          }
        )
        .toPromise()
    );
    return data.asset.getSignedAssetUploadSpecifications;
  },
  async publishUpdateGroupAsync(
    graphqlClient: ExpoGraphqlClient,
    publishUpdateGroupsInput: PublishUpdateGroupInput[]
  ): Promise<UpdatePublishMutation['updateBranch']['publishUpdateGroups']> {
    const data = await withErrorHandlingAsync(
      graphqlClient
        .mutation<UpdatePublishMutation>(
          gql`
            mutation UpdatePublishMutation($publishUpdateGroupsInput: [PublishUpdateGroupInput!]!) {
              updateBranch {
                publishUpdateGroups(publishUpdateGroupsInput: $publishUpdateGroupsInput) {
                  id
                  group
                  runtimeVersion
                  platform
                  manifestPermalink
                }
              }
            }
          `,
          { publishUpdateGroupsInput }
        )
        .toPromise()
    );
    return data.updateBranch.publishUpdateGroups;
  },

  async setCodeSigningInfoAsync(
    graphqlClient: ExpoGraphqlClient,
    updateId: string,
    codeSigningInfo: CodeSigningInfoInput
  ): Promise<SetCodeSigningInfoMutation['update']['setCodeSigningInfo']> {
    const data = await withErrorHandlingAsync(
      graphqlClient
        .mutation<SetCodeSigningInfoMutation>(
          gql`
            mutation SetCodeSigningInfoMutation(
              $updateId: ID!
              $codeSigningInfo: CodeSigningInfoInput!
            ) {
              update {
                setCodeSigningInfo(updateId: $updateId, codeSigningInfo: $codeSigningInfo) {
                  id
                  group
                  awaitingCodeSigningInfo
                  codeSigningInfo {
                    keyid
                    alg
                    sig
                  }
                }
              }
            }
          `,
          { updateId, codeSigningInfo }
        )
        .toPromise()
    );
    return data.update.setCodeSigningInfo;
  },
};
