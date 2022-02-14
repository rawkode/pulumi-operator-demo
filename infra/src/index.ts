import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";

const cluster = new eks.Cluster("production", {
  createOidcProvider: true,
});
const clusterOidcProvider = cluster.core.oidcProvider;

import { allowOnboarding, onboardTeam } from "./teams";

const teamDeps = allowOnboarding({
  provider: cluster.provider,
});

const config = new pulumi.Config();
const pulumiAccessToken = config.requireSecret("pulumiAccessToken");
import { becomeS3Full } from "./identities/s3-full";

onboardTeam(
  {
    name: "operator-demo",
    org: "P4X-6",
    repository: "https://github.com/rawkode/pulumi-operator-demo",
    directory: "s3-bucket",
    reference: "refs/heads/main",
    accessToken: pulumiAccessToken,
  },
  {
    provider: cluster.provider,
    serviceAccount: clusterOidcProvider
      ? becomeS3Full(cluster.provider, clusterOidcProvider)
      : undefined,
  },
  teamDeps
);
