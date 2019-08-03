#! /usr/bin/pwsh

yarn test --no-watch

yarn build

$version = (Get-Content package.json) -join "`n" | ConvertFrom-Json | Select -ExpandProperty "version"
if ($version -like '*rc*') { 
  echo "$version @next"
  npm publish --tag=next 
} else{
  echo $version
  npm publish 
}