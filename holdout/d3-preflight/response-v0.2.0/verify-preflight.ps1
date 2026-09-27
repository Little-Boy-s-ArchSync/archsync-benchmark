param(
  [string]$PreflightDir = 'D:\Little Boys\ArchSync\outputs\D3-Preflight-Received-76fa9d3\d3-preflight',
  [string]$OriginalPacket = 'D:\Little Boys\ArchSync\outputs\ArchSync-D3-Hoang-20260927',
  [string]$CasesFile = 'D:\Little Boys\ArchSync\outputs\ArchSync-D3-Review-20260927\cases.json',
  [string]$ContractFile = 'D:\Little Boys\ArchSync\outputs\ArchSync-D3-Contracts-v0.1.0\contract.json',
  [string]$OutputDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
function Assert-Same($Actual, $Expected, [string]$Context) {
  if ([string]$Actual -cne [string]$Expected) { throw "Mismatch: $Context" }
}
function Hash-File([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-Json([string]$Path) { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
function Exclusion([string]$Path) {
  if ($Path -cmatch '\.d\.ts$') { return 'declaration' }
  if ($Path -cmatch '(^|/)(test|tests|__tests__|fixtures|__fixtures__|__mocks__)(/|$)|\.(test|spec)\.tsx?$') { return 'test-or-fixture' }
  return ''
}
function Same-Keys($Actual, $Expected, [string]$Context) {
  Assert-Same $Actual.Count $Expected.Count "$Context count"
  if (@(Compare-Object -ReferenceObject @($Expected) -DifferenceObject @($Actual) -CaseSensitive).Count) { throw "Key mismatch: $Context" }
  Assert-Same @($Actual | Sort-Object -Unique -CaseSensitive).Count $Actual.Count "$Context duplicates"
}
function Check-Blob([byte[]]$Bytes, [string]$Sha256, [string]$Oid, [string]$Context) {
  $sha=[System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
  Assert-Same $sha $Sha256 "$Context SHA256"
  $header=[System.Text.Encoding]::UTF8.GetBytes("blob $($Bytes.Length)`0")
  $buffer=[byte[]]::new($header.Length+$Bytes.Length)
  [Array]::Copy($header,0,$buffer,0,$header.Length)
  [Array]::Copy($Bytes,0,$buffer,$header.Length,$Bytes.Length)
  $actualOid=[System.Convert]::ToHexString([System.Security.Cryptography.SHA1]::HashData($buffer)).ToLowerInvariant()
  Assert-Same $actualOid $Oid "$Context Git blob"
}

Assert-Same (Hash-File $CasesFile) '4998ea4bffe219a4f74449d187a8ffe1272451df828801a1dbdb6ef9d5b9b8ba' 'local case bundle'
Assert-Same (Hash-File $ContractFile) 'efff60a655ebc2eaf9819ddf1e15646c7cfe7f82f0cf8bb44d54464354fe3b8a' 'previous proposed contract'
$contract=Read-Json $ContractFile
$bundle=Read-Json $CasesFile
$manifest=Read-Json (Join-Path $PreflightDir 'PREPARATION-MANIFEST.json')
Assert-Same $manifest.status 'preparation-not-approved' 'packet status'
Assert-Same $manifest.labels 0 'packet labels'
Assert-Same $manifest.predictions 0 'packet predictions'
foreach ($file in $manifest.files) {
  if ($file.path -cnotmatch '^[A-Za-z0-9_.-]+$' -or $file.path.Contains('..')) { throw 'Unsafe manifest filename' }
  $path=Join-Path $PreflightDir $file.path
  Assert-Same (Hash-File $path) $file.sha256 "preflight $($file.path)"
  Assert-Same (Get-Item -LiteralPath $path).Length $file.bytes "preflight length $($file.path)"
}
Same-Keys @((Get-ChildItem -LiteralPath $PreflightDir -File).Name) @(@($manifest.files.path)+'PREPARATION-MANIFEST.json') 'packet inventory'
$summary=Read-Json (Join-Path $PreflightDir 'candidate-index-summary.json')
foreach ($sourceInput in $summary.source_inputs.PSObject.Properties) {
  if ($sourceInput.Name -notmatch '^data/[a-zA-Z0-9/-]+\.json$' -or $sourceInput.Name.Contains('..')) { throw 'Unsafe source input' }
  Assert-Same (Hash-File (Join-Path $OriginalPacket $sourceInput.Name)) $sourceInput.Value "source input $($sourceInput.Name)"
}
$files=@(Import-Csv -LiteralPath (Join-Path $PreflightDir 'candidate-snapshot-files.csv'))
$repos=@(Import-Csv -LiteralPath (Join-Path $PreflightDir 'candidate-repositories.csv'))
$cases=@(Import-Csv -LiteralPath (Join-Path $PreflightDir 'candidate-change-cases.csv'))
$paths=@(Import-Csv -LiteralPath (Join-Path $PreflightDir 'candidate-change-paths.csv'))
$changes=Read-Json (Join-Path $OriginalPacket 'data/d3-change-packets-20260927-01/change-summary.json')
Same-Keys @($repos.repository) @($contract.repositories.id) 'repositories'
$repoCounts=@()
foreach ($spec in $contract.repositories) {
  $repo=$repos | Where-Object repository -CEQ $spec.id
  Assert-Same $repo.pinned_commit $spec.reference_commit 'repository pin'
  Assert-Same $repo.scope $spec.case_scope 'repository scope'
  Assert-Same $repo.source_manifest_sha256 $spec.source.manifest_sha256 'source manifest pin'
  $sourcePath=Join-Path $OriginalPacket $spec.source.manifest
  Assert-Same (Hash-File $sourcePath) $spec.source.manifest_sha256 'source manifest bytes'
  $source=Read-Json $sourcePath
  $entries=if($spec.source.kind -eq 'git-object-packet') { @($source.entries) } else { @($source.repository.tracked_files) }
  $expected=@($entries | Where-Object { $_.path.StartsWith($spec.case_scope+'/',[StringComparison]::Ordinal) -and $_.path -cmatch '\.tsx?$' -and $_.mode -in @('100644','100755') })
  $repoFiles=@($files | Where-Object repository -CEQ $spec.id)
  Same-Keys @($repoFiles.path) @($expected.path) "$($spec.id) full scoped snapshot population"
  foreach($row in $repoFiles) {
    $entry=$expected | Where-Object path -CEQ $row.path
    foreach($pair in @(@('pinned_commit',$spec.reference_commit),@('scope',$spec.case_scope),@('sha256',$entry.sha256),@('git_blob',$entry.git_blob),@('git_mode',$entry.mode),@('proposed_exclusion',(Exclusion $row.path)))) { Assert-Same $row.($pair[0]) $pair[1] "$($row.path) $($pair[0])" }
    $dataPath=if($spec.source.kind -eq 'git-object-packet') { Join-Path $OriginalPacket "$($spec.source.root)/blobs/$($entry.git_blob)" } else { Join-Path $OriginalPacket "$($spec.source.root)/$($entry.path)" }
    Check-Blob ([System.IO.File]::ReadAllBytes($dataPath)) $entry.sha256 $entry.git_blob $row.path
  }
  $proposed=@($repoFiles | Where-Object { -not (Exclusion $_.path) }).Count
  Assert-Same $repo.scoped_typescript_files $expected.Count 'repo snapshot count'
  Assert-Same $repo.proposed_review_files $proposed 'repo proposed count'
  $repoCounts+=@{repository=$spec.id;snapshot_files=$expected.Count;proposed_primary_files=$proposed}
}
$expectedCases=@($changes.repositories | ForEach-Object { $_.cases })
Same-Keys @($cases.case_id) @($expectedCases.id) 'change case inventory'
Same-Keys @($cases.case_id) @($bundle.cases.id) 'local/source case inventory'
$expectedPathKeys=@()
$emptyCases=@()
foreach($row in $cases) {
  $repo=$changes.repositories | Where-Object repository -CEQ $row.repository
  if (-not $repo) { throw 'Unknown repository in case index' }
  $item=$repo.cases | Where-Object id -CEQ $row.case_id
  $local=$bundle.cases | Where-Object id -CEQ $row.case_id
  foreach($pair in @(@('base_commit',$item.base),@('head_commit',$item.head),@('scope',$repo.scope),@('changed_paths_in_scope',$item.changes.Count),@('status',$item.status))) { Assert-Same $row.($pair[0]) $pair[1] "$($row.case_id) $($pair[0])" }
  Assert-Same $local.base $item.base 'local base'
  Assert-Same $local.head $item.head 'local head'
  $reviewable=@($item.changes | Where-Object { -not (Exclusion $_.path) -and $_.path -cmatch '\.tsx?$' }).Count
  Assert-Same $row.proposed_review_paths $reviewable 'reviewable path count'
  Assert-Same $row.all_paths_proposed_excluded $(if($reviewable -eq 0){'yes'}else{'no'}) 'empty-case flag'
  if($reviewable -eq 0) { $emptyCases+=$item.id }
  foreach($change in $item.changes) {
    $expectedPathKeys+="$($row.case_id)|$($change.path)"
    $index=@($paths | Where-Object { $_.case_id -ceq $row.case_id -and $_.path -ceq $change.path })
    Assert-Same $index.Count 1 'change-path uniqueness'
    foreach($pair in @(@('repository',$row.repository),@('base_commit',$item.base),@('head_commit',$item.head),@('change_status',$change.status),@('base_mode',$change.base_mode),@('head_mode',$change.head_mode),@('base_git_blob',$change.base_oid),@('head_git_blob',$change.head_oid),@('proposed_exclusion',(Exclusion $change.path)),@('typescript',$(if($change.path -cmatch '\.tsx?$'){'yes'}else{'no'})))) { Assert-Same $index[0].($pair[0]) $pair[1] "$($row.case_id):$($change.path) $($pair[0])" }
    foreach($blob in @($item.blobs | Where-Object path -CEQ $change.path)) {
      $blobPath=Join-Path $OriginalPacket "data/d3-change-packets-20260927-01/$($row.repository.Replace('/','--'))/blobs/$($blob.git_blob)"
      Check-Blob ([System.IO.File]::ReadAllBytes($blobPath)) $blob.sha256 $blob.git_blob "$($row.case_id):$($blob.side):$($blob.path)"
    }
  }
}
Same-Keys @($paths | ForEach-Object { "$($_.case_id)|$($_.path)" }) $expectedPathKeys 'change path inventory'
foreach($name in @('snapshot-scope-decision.template.csv','change-case-decision.template.csv','change-path-scope-decision.template.csv')) {
  foreach($row in @(Import-Csv -LiteralPath (Join-Path $PreflightDir $name))) {
    foreach($field in @('final_scope_decision','decision_reason','decision_maker','decided_at_utc','scope_version')) { Assert-Same $row.$field '' "$name blank $field" }
  }
}
Assert-Same @(Import-Csv -LiteralPath (Join-Path $PreflightDir 'architecture-rules.template.csv')).Count 0 'blank rule register'
$uniquePaths=@($paths | ForEach-Object { "$($_.repository)|$($_.path)" } | Sort-Object -Unique -CaseSensitive).Count
$uniqueCommits=@($cases | ForEach-Object { "$($_.repository)|$($_.base_commit)"; "$($_.repository)|$($_.head_commit)" } | Sort-Object -Unique -CaseSensitive).Count
foreach($pair in @(@('repositories',$repos.Count),@('scoped_typescript_files',$files.Count),@('proposed_review_files',@($files | Where-Object { -not (Exclusion $_.path) }).Count),@('candidate_change_cases',$cases.Count),@('change_path_occurrences',$paths.Count),@('distinct_repository_qualified_change_paths',$uniquePaths),@('distinct_repository_qualified_endpoint_commits',$uniqueCommits))) { Assert-Same $summary.($pair[0]) $pair[1] "summary $($pair[0])" }
Same-Keys @($summary.cases_with_no_proposed_review_path) $emptyCases 'empty-case list'
$nonTs=@($paths | Where-Object typescript -CEQ 'no')
Same-Keys @($summary.non_typescript_change_paths | ForEach-Object { "$($_.case_id)|$($_.path)" }) @($nonTs | ForEach-Object { "$($_.case_id)|$($_.path)" }) 'non-TS list'
$audit=[ordered]@{
  schema='d3-preflight-reconciliation/1';status='source-reconciled-not-scientifically-approved';verified_at_utc=[DateTime]::UtcNow.ToString('o')
  archive_sha256='76fa9d3ad76c3885ca7125d9e6a209f212b4534daaa127ee0c6e581fd5dcfe4a'
  checks=@('All 20 manifest files match bytes and SHA-256','Exact three repository pins/scopes match retained original','All 434 snapshot rows match scoped original inventory, source SHA-256 and Git blobs','All 60 cases and 214 path occurrences match original receipt metadata and retained blobs','Human decision fields and architecture rule register remain blank')
  counts=@{repositories=$repos.Count;snapshot_files=$files.Count;proposed_primary_snapshot_files=$summary.proposed_review_files;candidate_cases=$cases.Count;changed_path_occurrences=$paths.Count;unique_repo_paths=$uniquePaths;unique_repo_endpoint_commits=$uniqueCommits;proposed_primary_ts_path_occurrences=@($paths | Where-Object { $_.typescript -ceq 'yes' -and -not (Exclusion $_.path) }).Count;test_path_occurrences=@($paths | Where-Object proposed_exclusion -CEQ 'test-or-fixture').Count;non_ts_path_occurrences=$nonTs.Count}
  by_repository=$repoCounts;candidate_context_only_cases=$emptyCases
  scientific_truth_verified=$false;human_approval_created=$false;labels_created=$false;predictions_executed=$false
}
$scope=[ordered]@{
  schema='d3-scope-candidate/1';version='0.2.0';status='proposed-not-accepted';human_acceptances=@();source_archive_sha256=$audit.archive_sha256
  semantics='Production TS/TSX primary candidate scope; tests, fixtures and declarations retained as context. Runtime-relevant non-TS context retained without becoming TS module-edge denominator. No final case labels.'
  snapshot_rows=@($files | ForEach-Object { [ordered]@{repository=$_.repository;commit=$_.pinned_commit;path=$_.path;sha256=$_.sha256;git_blob=$_.git_blob;proposed_role=$(if(Exclusion $_.path){'context-only'}else{'primary-candidate'});reason=$(if(Exclusion $_.path){Exclusion $_.path}else{'production-ts-candidate-not-completeness-certified'})} })
  case_rows=@($cases | ForEach-Object { [ordered]@{case_id=$_.case_id;repository=$_.repository;base=$_.base_commit;head=$_.head_commit;proposed_role=$(if($_.case_id -in $emptyCases){'context-only'}else{'primary-candidate'});reason=$(if($_.case_id -in $emptyCases){'only-proposed-excluded-paths-not-a-no-impact-label'}else{'contains-production-ts-candidate-path'});label=$null} })
  changed_path_rows=@($paths | ForEach-Object { [ordered]@{case_id=$_.case_id;repository=$_.repository;path=$_.path;base_git_blob=$_.base_git_blob;head_git_blob=$_.head_git_blob;proposed_role=$(if(Exclusion $_.path){'context-only'}elseif($_.typescript -ceq 'no'){'required-context-non-ts'}else{'primary-candidate'});reason=$(if(Exclusion $_.path){Exclusion $_.path}elseif($_.typescript -ceq 'no'){'retained-config-context-not-ts-module-unit'}else{'production-ts-candidate-not-completeness-certified'})} })
}
foreach($name in @('verification.json','scope-proposal.json')) { if(Test-Path -LiteralPath (Join-Path $OutputDir $name)) { throw 'Refusing to overwrite retained output; choose a new output directory' } }
foreach($item in @(@('verification.json',$audit),@('scope-proposal.json',$scope))) {
  $value=ConvertTo-Json -InputObject $item[1] -Depth 12
  [System.IO.File]::WriteAllText((Join-Path $OutputDir $item[0]),$value+"`n",[System.Text.UTF8Encoding]::new($false))
}
$audit | ConvertTo-Json -Depth 7
