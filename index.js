/**
 * videokub.com plugin for Showtime
 *
 *  Copyright (C) 2016 Wain
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var plugin = this,
    PREFIX = plugin.getDescriptor().id,
    BASE_URL = 'http://videokub.com',
    logo = plugin.path + "logo.png",
    html = require('showtime/html'),
    io = require('native/io');

plugin.createService(PREFIX, PREFIX + ":start", "video", true, logo);


function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

function makeRequest(page, url, settings, returnUnparsed) {
    var response;
    if (!url) {
        return showtime.message('NO_URL_IN_REQUEST');
    }
    if (!page) {
        return showtime.message('NO_PAGE_OBJECT_IN_REQUEST');
    }
    if (!settings) {
        settings = {
            method: 'GET'
        };
    }

    if (url.indexOf("http") !== 0) {
        url = BASE_URL + url;
    }
    page.loading = true;

    response = showtime.httpReq(url, settings);
    page.loading = false;
    if (returnUnparsed) {
        return {
            dom: html.parse(response.toString()).root,
            text: response.toString()
        }
    }
    return html.parse(response.toString()).root;

}

function findItems(page, dom, countEntries) {
    var list = dom.getElementByClassName('post'),
        i, length = list.length,
        item, links,
        url, picture, name, description;

    for (i = 4; i < length; i++) {
        item = list[i];
        links = item.getElementByTagName("a");
        url = links[0].attributes[0].value;
        name = links[0].textContent;
        picture = links[3].getElementByTagName("img")[0];
        if (picture) {
            picture = picture.attributes[0].value;
        }
        else {
            picture = "";
        }
        description = item.getElementByTagName("p")[0].textContent;

        page.appendItem(PREFIX + ':item:' + encodeURIComponent(url) + ':' + encodeURIComponent(name), 'video', {
            title: name,
            icon: picture,
            description: description
        });

        if (countEntries) {
            page.entries++;
        }
    }
}


function findNextPage(dom, searchMode) {
    var next = dom.getElementByClassName('pnext');
    if (next.length) {
        next = next[0];
        if (searchMode) {
            return next.children[0].nodeName.toLowerCase() === 'a';
        }
        next = next.children[0].attributes.getNamedItem('href').value;
        return next;
    }
    return false;
}


plugin.addURI(PREFIX + ":start", function (page) {
    setPageHeader(page, plugin.getDescriptor().synopsis);
    var response = makeRequest(page, BASE_URL),
        sections, section, i, length,
        links, link;


    //на главной странице находится несколько секций, парсим каждую из них
    sections = response.getElementById('swipe-menu-responsive').getElementByClassName("dropdown")[0].getElementByTagName('li');
    length = sections.length;
    //1 is set intentionally, category 0 is not the correct one
    for (i = 1; i < length; i++) {
        section = sections[i];
        links = section.getElementByTagName('a');
        if (links.length) {
            page.appendItem(PREFIX + ':list:' + encodeURIComponent(links[0].attributes[0].value) + ':' + encodeURIComponent(links[0].textContent), 'directory', {
                title: links[0].textContent
            });
        }
    }
});

plugin.addURI(PREFIX + ":list:(.*):(.*)", function (page, url, title) {
    var paginator = function () {
        var dom = makeRequest(page, decodeURIComponent(url)),
            newUrl;
        findItems(page, dom);
        newUrl = findNextPage(dom);
        if (newUrl) {
            url = newUrl;
        }
        return !!newUrl;

    };
    setPageHeader(page, decodeURIComponent(title));
    paginator();
    page.paginator = paginator;
});


plugin.addURI(PREFIX + ":item:(.*):(.*)", function (page, reqUrl, title) {
    title = decodeURIComponent(title);
    setPageHeader(page, title);
    reqUrl = decodeURIComponent(reqUrl);
    var response = makeRequest(page, reqUrl),
        iframeUrl, iframeResponse, url, paramsRegExp = /var params = ([\w\W]*)};/gm, params, i, length,
        youtubeRegExp = /youtube\.com\/embed\/(\w+)/;

    page.loading = true;

    //Step 1. Find "iframe" element and load it
    iframeUrl = response.getElementByTagName("iframe")[0].attributes[2].value;
    iframeResponse = makeRequest(page, iframeUrl, null, true);

    //Check for youTube video. If found, redirect to youTube plugin
    params = youtubeRegExp.exec(iframeResponse.text);
    if (params && params[1]) {
        return page.redirect("youtube:video:" + params[1]);
    }

    params = paramsRegExp.exec(iframeResponse.text)[0].replace(/(?:\r\n|\r|\n)/g, '');
    eval(params);
    params = params.playlist;
    length = params.length;

    if (length === 1) {
        return page.redirect(PREFIX + ':play:' + encodeURIComponent(params[0].video[0].url) + ':' + encodeURIComponent(params[0].title) + ':' + encodeURIComponent(params[0].posterUrl));
    }

    for (i = 0; i < length; i++) {
        page.appendItem(PREFIX + ':play:' + encodeURIComponent(params[i].video[0].url) + ':' + encodeURIComponent(params[i].title) + ':' + encodeURIComponent(params[i].posterUrl), 'video', {
            title: params[i].title,
            icon: params[i].posterUrl
        });
    }


    /*page.loading = false;
     page.source = "videoparams:" + showtime.JSONEncode({
     title: params.playlist[0].title,
     canonicalUrl: PREFIX + ':play:' + url + ':' + title,
     sources: [{
     url: link
     }]
     });*/
});

plugin.addURI(PREFIX + ":play:(.*):(.*):(.*)", function (page, url, title, poster) {
    page.type = "video";
    page.loading = false;
    page.source = "videoparams:" + showtime.JSONEncode({
            title: decodeURIComponent(title),
            canonicalUrl: PREFIX + ':play:' + url + ':' + title,
            sources: [{
                url: decodeURIComponent(url),
                icon: decodeURIComponent(poster)
            }]
        });
});


function unicode2win1251(str) {
    var result = "", uniCode, winCode, i;
    if (!str || typeof str !== 'string') return '';
    for (i = 0; i < str.length; i++) {
        uniCode = str.charCodeAt(i);
        if (uniCode == 1105) {
            winCode = 184;
        } else if (uniCode == 1025) {
            winCode = 168;
        } else if (uniCode > 1039 && uniCode < 1104) {
            winCode = uniCode - 848;
        } else {
            winCode = uniCode;
        }
        result += String.fromCharCode(winCode);
    }
    var encoded = "";
    for (i = 0; i < result.length; ++i) {
        var code = Number(result.charCodeAt(i));
        encoded += "%" + code.toString(16).toUpperCase();
    }
    return encoded;
}


plugin.addSearcher(plugin.getDescriptor().id, logo, function (page, query) {
    var pageNum = 1,
        paginator = function () {
            var dom = makeRequest(page, BASE_URL + '/index.php?do=search', {
                    postdata: {
                        subaction: 'search',
                        do: 'search',
                        full_search: 0,
                        search_start: pageNum,
                        result_from: page.entries + 1,
                        story: unicode2win1251(query)
                    }
                }),
                hasNextPage;
            findItems(page, dom, true);
            hasNextPage = findNextPage(dom, true);
            if (hasNextPage) {
                pageNum++;
            }
            return !!hasNextPage;

        };
    page.entries = 0;
    page.paginator = paginator;
    paginator();
});