# Changelog

All notable changes to this project are documented in this file.

Release notes are generated from Conventional Commits by semantic-release and
committed through a release pull request after required checks pass.

## [1.7.2](https://github.com/dziksu/synkinema/compare/v1.7.1...v1.7.2) (2026-10-08)

### Bug Fixes

* **launcher:** check explicit Docker image registry ([fc0c556](https://github.com/dziksu/synkinema/commit/fc0c556fa67bb7c95d1ff473a719782187c06449))
* **launcher:** diagnose Docker setup and guard public image access ([b21b0c1](https://github.com/dziksu/synkinema/commit/b21b0c11ffc17436c7f9875fcfb06db6f2ffbe2b))

## [1.7.1](https://github.com/dziksu/synkinema/compare/v1.7.0...v1.7.1) (2026-10-06)

### Build and Dependencies

* **deps-dev:** bump swagger-typescript-api from 13.12.6 to 13.13.0 in /apps/studio ([e5efff7](https://github.com/dziksu/synkinema/commit/e5efff73c7f98c0b4a4d3493a713e99dd34e6cb4))
* **deps:** bump huggingface-hub from 1.32.0 to 1.33.0 in the speech group ([77aa43d](https://github.com/dziksu/synkinema/commit/77aa43d91593f5141b62c968e66bfa1009850b2b))
* **deps:** bump mako from 1.4.1 to 1.4.3 ([2dbe938](https://github.com/dziksu/synkinema/commit/2dbe9380e42d93e01a45dcbaeeeb009b46baf19a))
* **deps:** bump pyjwt from 2.14.0 to 2.15.1 ([bb7d735](https://github.com/dziksu/synkinema/commit/bb7d735d7eeea6e7e9dd0b85ef16c70c43d59a35))
* **deps:** bump react-hook-form from 7.88.0 to 7.89.0 in /apps/studio ([8297ac9](https://github.com/dziksu/synkinema/commit/8297ac9532461d2e52c5187788fabe76d6c2a1f4))
* **deps:** bump react-resizable-panels from 4.14.1 to 4.14.2 in /apps/studio ([13b7030](https://github.com/dziksu/synkinema/commit/13b703044ac75f69fbce04762a8aa3d7411567bb))
* **deps:** bump shadcn from 4.21.0 to 4.21.1 in /apps/studio ([0d2aeab](https://github.com/dziksu/synkinema/commit/0d2aeab643390c64b94929001eb67a0f0e64f4f5))
* **deps:** bump the studio group in /apps/studio with 5 updates ([fa104ed](https://github.com/dziksu/synkinema/commit/fa104ed227f783d221b072ca1e2e2c2aa9743a63))
* **deps:** bump undici from 8.10.2 to 8.11.2 in /apps/studio ([58192f5](https://github.com/dziksu/synkinema/commit/58192f59253e7722ad0ee54d5cd58f35b456b1bf))
* **deps:** bump watchfiles from 1.2.0 to 1.3.0 ([89d9631](https://github.com/dziksu/synkinema/commit/89d9631de4aee07d906cdcdbc5c1971024767bd9))
* **deps:** group Dependabot updates and fix Pydantic core resolution ([74e5937](https://github.com/dziksu/synkinema/commit/74e5937e1fc54b48f2338388c9005bc20a9b453d))
* **deps:** patch vulnerable Studio transitive dependencies ([9f70d07](https://github.com/dziksu/synkinema/commit/9f70d07cdbb4d960127842d6b6382fe56610cab1))
* **deps:** update Python dependencies and guard speech compatibility ([967011d](https://github.com/dziksu/synkinema/commit/967011daba427042bcd9fa502ea88eeb54379b1b))

## [1.7.0](https://github.com/dziksu/synkinema/compare/v1.6.2...v1.7.0) (2026-10-05)

### Features

* **chat:** add native CLI chat and local Docker installer ([#74](https://github.com/dziksu/synkinema/issues/74)) ([f8c0799](https://github.com/dziksu/synkinema/commit/f8c0799bd4f1a3be2f8b7c8b37095d998a837102))

## [1.6.2](https://github.com/dziksu/synkinema/compare/v1.6.1...v1.6.2) (2026-10-02)

### Bug Fixes

* **studio:** align recent projects with sidebar navigation ([5ac0086](https://github.com/dziksu/synkinema/commit/5ac00864e8525fe555f9da7e77c34fc18010b0fc))

## [1.6.1](https://github.com/dziksu/synkinema/compare/v1.6.0...v1.6.1) (2026-10-01)

### Bug Fixes

* **channels:** order reviews by video publication time ([1f4dc5c](https://github.com/dziksu/synkinema/commit/1f4dc5c14096d8236212f61f9124d8757c219397))
* **channels:** sort history and preserve archived project names ([9064c5e](https://github.com/dziksu/synkinema/commit/9064c5e6b015e926657e3eb5b9ebf21b76f1e75a))

## [1.6.0](https://github.com/dziksu/synkinema/compare/v1.5.0...v1.6.0) (2026-09-26)

### Features

* **studio:** pro timeline editing with multi-select and linked audio ([c6b5d5d](https://github.com/dziksu/synkinema/commit/c6b5d5d9d08d984b1ee96ae91c64fb41f0f6098c))

## [1.5.0](https://github.com/dziksu/synkinema/compare/v1.4.2...v1.5.0) (2026-09-26)

### Features

* **mcp:** reject unknown arguments and version channel edits ([8a0a69a](https://github.com/dziksu/synkinema/commit/8a0a69ae358f1b64c9143fe2780b09afff5b8364))

### Bug Fixes

* **renderer:** keep layers on their last covered frame ([67ff894](https://github.com/dziksu/synkinema/commit/67ff894a5d5f45319981703c7a75e7a97c71df8b))

## [1.4.2](https://github.com/dziksu/synkinema/compare/v1.4.1...v1.4.2) (2026-09-23)

### Bug Fixes

* **renderer:** stream compositions through file stages ([8988d13](https://github.com/dziksu/synkinema/commit/8988d13d776f9acee34423d5e42f48a555850a0f))

## [1.4.1](https://github.com/dziksu/synkinema/compare/v1.4.0...v1.4.1) (2026-09-17)

### Bug Fixes

* **studio:** repair expanded preview dialog ([66e37be](https://github.com/dziksu/synkinema/commit/66e37be918374ecd44aaa6186f2723042ff2cd86))

## [1.4.0](https://github.com/dziksu/synkinema/compare/v1.3.1...v1.4.0) (2026-09-16)

### Features

* **production:** link script audio to timeline ([2f687bc](https://github.com/dziksu/synkinema/commit/2f687bc6872baf3fc338bd77f4e3fb6284347d8e))

## [1.3.1](https://github.com/dziksu/synkinema/compare/v1.3.0...v1.3.1) (2026-09-16)

### Bug Fixes

* **studio:** refine dashboard branding ([1e7a691](https://github.com/dziksu/synkinema/commit/1e7a691df375c8f7a3d76d09a5fdf09048b9d80a))

## [1.3.0](https://github.com/dziksu/synkinema/compare/v1.2.0...v1.3.0) (2026-09-16)

### Features

* **studio:** replace legacy dashboard with TanStack Start ([7205883](https://github.com/dziksu/synkinema/commit/720588327db33962e65fa3dc2f0717beefcb35f6))

### Bug Fixes

* **script:** resolve conflicts with main ([8aa60ee](https://github.com/dziksu/synkinema/commit/8aa60ee6d4e623aff1ee3856c0d8813a5ce7c603))

## [1.2.0](https://github.com/dziksu/synkinema/compare/v1.1.2...v1.2.0) (2026-09-15)

### Features

* improve agent guidance and Studio accessibility ([e4290cc](https://github.com/dziksu/synkinema/commit/e4290ccbe555438ead1bd4b79b7bf4257adfa6e0))
* **release:** automate release pull requests ([936b61d](https://github.com/dziksu/synkinema/commit/936b61d4a7454a3e0c79e7b8a56f1f2b84425924))

### Bug Fixes

* **release:** plan without push permissions ([28c525d](https://github.com/dziksu/synkinema/commit/28c525d51be6f91a947d62361eaebf568756a01b))

## [1.0.1](https://github.com/dziksu/synkinema/compare/v1.0.0...v1.0.1) (2026-09-14)

### Build and Dependencies

* **deps:** update Studio stack and align Node runtime ([515027a](https://github.com/dziksu/synkinema/commit/515027ab2b803133c4d78aaf291c507517e68ebe))

## 1.0.0 (2026-09-14)

### Features

* agent instruction dialog ([a5eabc1](https://github.com/dziksu/synkinema/commit/a5eabc1642f054a8a6f53e735cd5d7ee9e7830e8))

### Bug Fixes

* **compose:** move default host port to 43817 ([f125bd8](https://github.com/dziksu/synkinema/commit/f125bd844a204a67fec0e929a3d5ef8b30597981))
