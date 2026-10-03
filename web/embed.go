// Package web holds the static operator console, embedded into the binary so
// the container needs nothing but the executable.
package web

import "embed"

// Files contains the served static assets.
//
//go:embed index.html
var Files embed.FS
