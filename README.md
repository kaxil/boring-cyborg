# Boring Cyborg

🤖 A GitHub App built with [Probot](https://github.com/probot/probot) that automatically label PRs, issues and 
performs all the boring operations that you don't want to do.

![Using Boring Cyborg Probot to add new labels](./assets/usage-screenshot-1.png)

![Congratulate user on first merged PR](./assets/usage-first-merged-pr.gif)

## Features

* Add labels based on the path of the file that are modified in the PR.
* Welcome new users to your project when they open their first Issue/PR or first merged PR by an
automated comment. 

## Usage

1. **[Configure the Github App](https://github.com/apps/boring-cyborg)**
2. After installing the Github app, create `.github/boring-cyborg.yml` in the default branch to enable it
3. It will start scanning for pull requests within few minutes.

```yaml
# Enable "labeler" for your PR that would add labels to PRs based on the paths that are modified in the PR. 
labelPRBasedOnFilePath:
  # Add 'label1' to any changes within 'example' folder or any subfolders
  label1:
    - example/**/*
  
  # Add 'label2' to any file changes within 'example2' folder
  label2: 
    - example2/*

  # Complex: Add 'area/core' label to any change within the 'core' package
  area/core:
    - src/core/*
    - src/core/**/*  
    
  # Add 'test' label to any change to *.spec.js files within the source dir
  test:
    - src/**/*.spec.js

# Comment to be posted to welcome users when they open their first PR
firstPRWelcomeComment: >
  Thanks for opening this pull request! Please check out our contributing guidelines.

# Comment to be posted to congratulate user on their first merged PR
firstPRMergeComment: >
  Awesome work, congrats on your first merged pull request!

# Comment to be posted to on first time issues
firstIssueWelcomeComment: >
  Thanks for opening your first issue here! Be sure to follow the issue template!

insertIssueLinkInPrDescription:
   # specify the placeholder for the issue link that should be present in the description
  descriptionIssuePlaceholderRegexp: "^Issue link: (.*)$"
  matchers:
      # you can have several matches - for different types of issues
      # only the first matching entry is replaced
      jiraIssueMatch:
          # specify the regexp of issue id that you can find in the title of the PR
          # the match groups can be used to build the issue id (${1}, ${2}, etc.).
          titleIssueIdRegexp: \[(AIRFLOW-[0-9]{4})\]
          # the issue link to be added. ${1}, ${2} ... are replaced with the match groups from the
          # title match (remember to use quotes)
          descriptionIssueLink: "[${1}](https://issues.apache.org/jira/browse/${1}/)"
      docOnlyIssueMatch:
          titleIssueIdRegexp: \[(AIRFLOW-X{4})\]
          descriptionIssueLink: "`Document only change, no JIRA issue`"
```

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Contributing

If you have suggestions for how boring-cyborg could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2020 Kaxil Naik
