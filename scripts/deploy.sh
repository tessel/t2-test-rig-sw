cd ../server

git checkout -b tmp-deploy
mv .gitignore.deploy .gitignore
git add .
git commit -m "deploy latest changes"
git push dokku HEAD:master -f
git checkout -
git branch -D tmp-deploy

echo "Latest changes deployed to Dokku"
