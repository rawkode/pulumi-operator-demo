package main

import (
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		bucket, err := s3.NewBucket(ctx, "serious-production-bucket", &s3.BucketArgs{
			AccessControl: "private"
		})
		if err != nil {
			return err
		}

		ctx.Export("bucketName", bucket.ID())
		return nil
	})
}
