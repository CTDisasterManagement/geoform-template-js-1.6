/*global $ */
define([
   "dojo/_base/declare",
    "dojo/on",
    "dojo/dom",
    "esri/request",
    "dojo/_base/array",
    "dojo/dom-construct",
    "dojo/dom-attr",
    "dojo/query",
    "dojo/dom-class",
    "dojo/_base/lang",
    "dojo/Deferred",
    "dojo/DeferredList",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/text!application/dijit/templates/author.html",
    "application/browseIdDlg",
    "application/ShareDialog",
    "dojo/i18n!application/nls/builder",
    "esri/arcgis/utils",
    "dojo/domReady!"
], function (declare, on, dom, esriRequest, array, domConstruct, domAttr, query, domClass, lang, Deferred, DeferredList, _WidgetBase, _TemplatedMixin, authorTemplate, BrowseIdDlg, ShareDialog, nls, arcgisUtils) {
    return declare([_WidgetBase, _TemplatedMixin], {
        templateString: authorTemplate,
        nls: nls,
        currentState: "webmap",
        previousState: null,
        currentConfig: null,
        previousConfig: null,
        response: null,
        userInfo: null,
        browseDlg: null,
        fieldInfo: {},
        themes: [
            { "name": "Cyborg", url: "themes/cyborg.css", "thumbnail": "images/cyborgThumbnail.jpg", "refUrl": "http://bootswatch.com/cyborg/" },
            { "name": "Cerulean", url: "themes/cerulean.css", "thumbnail": "images/cerulianThumbnail.jpg", "refUrl": "http://bootswatch.com/cerulean/" },
            { "name": "Journal", url: "themes/journal.css", "thumbnail": "images/journalThumbnail.jpg", "refUrl": "http://bootswatch.com/journal/" },
            { "name": "Darkly", url: "themes/darkly.css", "thumbnail": "images/darklyThumbnail.jpg", "refUrl": "http://bootswatch.com/darkly/" },
            { "name": "Readable", url: "themes/readable.css", "thumbnail": "images/readableThumbnail.jpg", "refUrl": "http://bootswatch.com/readable/" }
        ],

        constructor: function () {
        },

        startup: function (config, userInfo, response) {
            dom.byId("parentContainter").appendChild(this.authorMode);
            var $tabs = $('.tab-links li');
            domClass.add($('.navigationTabs')[0], "activeTab");

            $('.prevtab').on('click', lang.hitch(this, function () {
                $tabs.filter('.active').prev('li').find('a[data-toggle="tab"]').tab('show');
            }));

            $('.nexttab').on('click', lang.hitch(this, function () {
                $tabs.filter('.active').next('li').find('a[data-toggle="tab"]').tab('show');
            }));

            $('.navigationTabs').on('click', lang.hitch(this, function (evt) {
                this._getPrevTabDetails(evt);
            }));

            $('#saveButton').on('click', lang.hitch(this, function () {
                this._updateItem();
            }));

            this.previousConfig = lang.clone(this.config);
            this.currentConfig = config;
            this.userInfo = userInfo;
            this.response = response;
            this._addOperationalLayers();
            this._populateDetails();
            this._populateThemes();
            this._initWebmapSelection();
            this._loadCSS("css/browseDialog.css");
            on(dom.byId("selectLayer"), "change", lang.hitch(this, function (evt) {
                this.currentConfig.form_layer.id = evt.currentTarget.value;
                this._populateFields(evt.currentTarget.value);
                if (evt.currentTarget.value == nls.builder.selectLayerDefaultOptionText) {
                    array.forEach(query(".navigationTabs"), lang.hitch(this, function (currentTab) {
                        if (domAttr.get(currentTab, "tab") == "fields" || domAttr.get(currentTab, "tab") == "preview" || domAttr.get(currentTab, "tab") == "publish") {
                            this._disableTab(currentTab);
                        }
                    }));
                }
                else {
                    array.forEach(query(".navigationTabs"), lang.hitch(this, function (currentTab) {
                        if (domAttr.get(currentTab, "tab") == "fields" || ((domAttr.get(currentTab, "tab") === "preview" || domAttr.get(currentTab, "tab") === "publish") && query(".fieldCheckbox:checked").length !== 0)) {
                            this._enableTab(currentTab);
                        }
                    }));
                }
            }));
        },

        //function to get the details of previously selected tab
        _getPrevTabDetails: function (evt) {
            var _self = this;
            if (evt) {
                this.previousState = this.currentState;
                this.currentState = evt.currentTarget.getAttribute("tab");
                this._updateAppConfiguration(this.previousState);
                if (this.currentState == "preview") {
                    require([
                       "application/main"
                      ], function (userMode) {
                          var index = new userMode();
                          index.startup(_self.currentConfig, _self.response, true, query(".preview-frame")[0]);
                      });
                } else {
                    localStorage.clear();
                }
            }
        },

        //function will validate and add operational layers in dropdown
        _addOperationalLayers: function () {
            var layerDefeeredListArr = [], layerDefeeredList, attribute;
            this._clearLayerOptions();
            array.forEach(this.currentConfig.itemInfo.itemData.operationalLayers, lang.hitch(this, function (currentLayer) {
                if (currentLayer.url && currentLayer.url.split("/")[currentLayer.url.split("/").length - 2].toLowerCase() == "featureserver") {
                    layerDefeeredListArr.push(this._queryLayer(currentLayer.url, currentLayer.id));
                }
            }));
            layerDefeeredList = new DeferredList(layerDefeeredListArr);
            layerDefeeredList.then(lang.hitch(this, function () {
                if (dom.byId("selectLayer").options.length <= 1) {
                    alert(nls.builder.invalidWebmapSelectionAlert);
                    array.forEach(query(".navigationTabs"), lang.hitch(this, function (currentTab) {
                        attribute = currentTab.getAttribute("tab");
                        if (attribute != "webmap") {
                            this._disableTab(currentTab);
                        }
                    }));
                }
                else {
                    array.forEach(query(".navigationTabs"), lang.hitch(this, function (currentTab) {
                        attribute = currentTab.getAttribute("tab");
                        if (((attribute == "publish" || attribute == "preview") && (query(".fieldCheckbox:checked").length === 0)) || (attribute == "fields" && dom.byId("selectLayer").value === "Select Layer")) {
                            this._disableTab(currentTab);
                        }
                        else {
                            this._enableTab(currentTab);
                        }
                    }));
                }
            }));
        },

        //function to set the title, logo-path and description from config
        _populateDetails: function () {
            dom.byId("detailTitleInput").value = this.currentConfig.details.Title;
            dom.byId("detailLogoInput").value = this.currentConfig.details.Logo;
            dom.byId("detailDescriptionInput").value = this.currentConfig.details.Description;
        },

        //function to populate all available themes in application
        _populateThemes: function () {
            var themesHeader, themesRadioButton, themesDivContainer, themesDivContent, themesLabel, themeThumbnail;
            themesHeader = domConstruct.create("h2", { innerHTML: nls.builder.selectThemeText }, this.stylesList);
            array.forEach(this.themes, lang.hitch(this, function (currentTheme) {
                themesDivContainer = domConstruct.create("div", { class: "col-md-4" }, this.stylesList);
                themesDivContent = domConstruct.create("div", { class: "radio" }, themesDivContainer);
                themesLabel = domConstruct.create("label", { innerHTML: currentTheme.name }, themesDivContent);
                themesRadioButton = domConstruct.create("input", { type: "radio", name: "themesRadio", themeName: currentTheme.name, themeUrl: currentTheme.url }, themesLabel);
                if (currentTheme.name == this.currentConfig.theme.themeName) {
                    themesRadioButton.checked = true;
                    //this._loadCSS(currentTheme.url);
                }
                on(themesRadioButton, "change", lang.hitch(this, function (evt) {
                    this._configureTheme(evt);
                }));
                domConstruct.create("br", {}, themesLabel);
                themeThumbnail = domConstruct.create("img", { src: currentTheme.thumbnail, width: "200px", height: "133px", "style": "border:1px solid #555; " }, themesLabel);
                on(themeThumbnail, "click", function () { window.open(currentTheme.refUrl); });
            }));
        },

        //function to select the previously configured theme.
        _configureTheme: function (selectedTheme) {
            this.currentConfig.theme.themeName = selectedTheme.currentTarget.getAttribute("themeName");
            this.currentConfig.theme.themeSrc = selectedTheme.currentTarget.getAttribute("themeUrl");
        },

        //function will populate all editable fields with validations
        _populateFields: function (layerName) {
            var configuredFields = [], configuredFieldName = [], fieldRow, fieldName, fieldLabel, fieldLabelInput, fieldDescription, fieldDescriptionInput, fieldCheckBox,
            fieldType, fieldTypeSelect, fieldCheckBoxInput, currentIndex = 0, layerIndex, fieldDNDIndicatorTD, fieldDNDIndicatorIcon;
            if (this.geoFormFieldsTable) {
                domConstruct.empty(this.geoFormFieldsTable);
            }
            array.forEach(this.currentConfig.fields, lang.hitch(this, function (currentField) {
                configuredFieldName.push(currentField.fieldName);
                configuredFields.push(currentField);
            }));

            array.forEach(this.currentConfig.itemInfo.itemData.operationalLayers, lang.hitch(this, function (currentLayer, index) {
                if (this.fieldInfo[layerName]) {
                    if (this.fieldInfo[layerName].layerUrl == currentLayer.url) {
                        layerIndex = index;
                    }
                }
            }));
            if (this.fieldInfo[layerName]) {
                array.forEach(this.fieldInfo[layerName].Fields, lang.hitch(this, function (currentField, fieldIndex) {
                    if (currentField.editable && !(currentField.type === "esriFieldTypeOID" || currentField.type === "esriFieldTypeGeometry" || currentField.type === "esriFieldTypeBlob" || currentField.type === "esriFieldTypeRaster" || currentField.type === "esriFieldTypeGUID" || currentField.type === "esriFieldTypeGlobalID" || currentField.type === "esriFieldTypeXML")) {
                        fieldRow = domConstruct.create("tr", { rowIndex: currentIndex }, this.geoFormFieldsTable);
                        fieldDNDIndicatorTD = domConstruct.create("td", {}, fieldRow);
                        fieldDNDIndicatorIcon = domConstruct.create("span", { "class": "ui-icon ui-icon-arrowthick-2-n-s" }, fieldDNDIndicatorTD);
                        fieldCheckBox = domConstruct.create("td", {}, fieldRow);

                        fieldCheckBoxInput = domConstruct.create("input", { "class": "fieldCheckbox", type: "checkbox", index: currentIndex, fieldIndex: fieldIndex }, fieldCheckBox);
                        on(fieldCheckBoxInput, "change", lang.hitch(this, function () {
                            this._getFieldCheckboxState();
                        }));
                        fieldName = domConstruct.create("td", { class: "fieldName", innerHTML: currentField.name, index: currentIndex, style: "color:#555; vertical-align:center !important;" }, fieldRow);
                        fieldLabel = domConstruct.create("td", {}, fieldRow);

                        fieldLabelInput = domConstruct.create("input", { class: "form-control fieldLabel", index: currentIndex, placeholder: nls.builder.fieldLabelPlaceHolder, value: currentField.alias }, fieldLabel);

                        fieldType = domConstruct.create("td", {}, fieldRow);
                        fieldTypeSelect = domConstruct.create("select", { disabled: "disabled", class: "form-control fieldSelect", index: currentIndex }, fieldType);
                        this._createFieldDataTypeOptions(currentField, fieldTypeSelect);

                        fieldDescription = domConstruct.create("td", {}, fieldRow);
                        fieldDescriptionInput = domConstruct.create("input", { class: "form-control fieldDescription", placeholder: nls.builder.fieldDescPlaceHolder, value: "" }, fieldDescription);
                        array.forEach(this.currentConfig.itemInfo.itemData.operationalLayers[layerIndex].popupInfo.fieldInfos, function (currentFieldPopupInfo) {
                            if (currentFieldPopupInfo.fieldName == currentField.name) {
                                if (currentFieldPopupInfo.tooltip) {
                                    fieldDescriptionInput.value = currentFieldPopupInfo.tooltip;
                                }
                            }
                        });
                        currentIndex++;
                        if (configuredFieldName.indexOf(currentField.name) != -1) {
                            configuredFields[configuredFieldName.indexOf(currentField.name)];
                            domAttr.set(fieldCheckBoxInput, "checked", true);
                            domAttr.set(fieldLabelInput, "value", configuredFields[configuredFieldName.indexOf(currentField.name)].fieldLabel);
                            if (configuredFields[configuredFieldName.indexOf(currentField.name)].fieldDescription) {
                                domAttr.set(fieldDescriptionInput, "value", configuredFields[configuredFieldName.indexOf(currentField.name)].fieldDescription);
                            }
                        } else {
                            domAttr.set(fieldCheckBoxInput, "checked", false);
                        }
                    }
                }));
            }

            $(document).ready(function () {
                $("#tbodyDND").sortable({
                });
            });
        },

        //function to fetch the datatype of the field
        _createFieldDataTypeOptions: function (currentField, fieldTypeSelect) {
            var fieldTypeSelectOption;
            fieldTypeSelectOption = domConstruct.create("option", {}, null);
            fieldTypeSelectOption.text = currentField.type.split("esriFieldType")[1];
            fieldTypeSelectOption.value = currentField.type.split("esriFieldType")[1];
            fieldTypeSelect.appendChild(fieldTypeSelectOption);
        },

        //function to query layer in order to obtain all the information of layer
        _queryLayer: function (layerUrl, layerId) {
            var layerDeferred = new Deferred();
            esriRequest({
                url: layerUrl,
                content: {
                    token: this.userInfo.token,
                    f: 'json'
                }
            }, { usePost: true }).then(lang.hitch(this, function (result) {
                this._validateFeatureServer(result, layerUrl, layerId);
                layerDeferred.resolve(true);
            }),
            function (error) {
                layerDeferred.resolve(true);
            });
            return layerDeferred.promise;
        },

        //function to filter editable layers from all the layers in webmap
        _validateFeatureServer: function (layerInfo, layerUrl, layerId) {
            if (layerInfo.capabilities.search("Create") != -1 && layerInfo.capabilities.search("Update") != 1) {
                var filteredLayer;
                filteredLayer = document.createElement("option");
                filteredLayer.text = layerId;
                filteredLayer.value = layerId;
                dom.byId("selectLayer").appendChild(filteredLayer);
                this.fieldInfo[layerId] = {};
                this.fieldInfo[layerId].Fields = layerInfo.fields;
                this.fieldInfo[layerId].layerUrl = layerUrl;
                if (layerId == this.currentConfig.form_layer.id) {
                    this._populateFields(layerId);
                    filteredLayer.selected = "selected";
                }
            }
        },

        //function to allow user to udate/select webmap from the list
        _initWebmapSelection: function () {
            var browseParams = {
                portal: this.userInfo.portal,
                galleryType: "webmap" //valid values are webmap or group
            };
            this.browseDlg = new BrowseIdDlg(browseParams, this.userInfo);
            on(this.browseDlg, "close", lang.hitch(this, function () {
                if (this.browseDlg.get("selected") !== null && this.browseDlg.get("selectedWebmap") !== null) {
                    if (this.browseDlg.get("selectedWebmap").thumbnailUrl) {
                        domAttr.set(query(".img-thumbnail")[0], "src", this.browseDlg.get("selectedWebmap").thumbnailUrl.split("?token")[0]);
                        this.currentConfig.webmapThumbnailUrl = this.browseDlg.get("selectedWebmap").thumbnailUrl.split("?token")[0];
                    } else {
                        domAttr.set(query(".img-thumbnail")[0], "src", "");
                    }
                    this.currentConfig.webmap = this.browseDlg.get("selectedWebmap").id;
                    domClass.add(document.body, "app-loading");
                    arcgisUtils.getItem(this.currentConfig.webmap).then(lang.hitch(this, function (itemInfo) {
                        this.currentConfig.fields.length = 0;
                        domConstruct.empty(this.geoFormFieldsTable);
                        this.currentConfig.itemInfo = itemInfo;
                        this._addOperationalLayers();
                        domClass.remove(document.body, "app-loading");
                    }), function (error) {
                        console.log(error);
                    });
                }
            }));

            on(dom.byId("selectWebmapBtn"), "click", lang.hitch(this, function () {
                this.browseDlg.show();
            }));

            if (this.currentConfig.webmapThumbnailUrl) {
                domAttr.set(query(".img-thumbnail")[0], "src", this.currentConfig.webmapThumbnailUrl);
            }
        },

        //function to load the css on runtime
        _loadCSS: function (sourcePath) {
            //Load browser dialog
            var cssStyle = document.createElement('link');
            cssStyle.rel = 'stylesheet';
            cssStyle.type = 'text/css';
            cssStyle.href = sourcePath;
            document.getElementsByTagName('head')[0].appendChild(cssStyle);
        },

        //function to remove all the layers from the select box
        _clearLayerOptions: function () {
            var i;
            for (i = dom.byId("selectLayer").options.length - 1; i >= 0; i--) {
                if (dom.byId("selectLayer").options[i].value != "Select Layer") {
                    dom.byId("selectLayer").remove(i);
                }
            }
        },

        //function takes the previous tab's details as input parameter and saves the setting to config
        _updateAppConfiguration: function (prevNavigationTab) {
            var _self = this;
            switch (prevNavigationTab) {
                case "webmap":
                    break;
                case "details":
                    this.currentConfig.details.Title = dom.byId("detailTitleInput").value;
                    this.currentConfig.details.Logo = dom.byId("detailLogoInput").value;
                    this.currentConfig.details.Description = dom.byId("detailDescriptionInput").value;
                    break;
                case "fields":
                    this.currentConfig.fields.length = 0;
                    var index, fieldName, fieldLabel, fieldType, fieldDescription, nullable, domain, defaultValue, sqlType, length,
                    layerName, fieldDataType;
                    layerName = dom.byId("selectLayer").value;
                    array.forEach($("#tableDND")[0].rows, lang.hitch(this, function (currentRow) {
                        if (currentRow.getAttribute("rowIndex") && query(".fieldCheckbox", currentRow)[0].checked) {
                            index = currentRow.getAttribute("rowIndex");
                            fieldName = query(".fieldName", currentRow)[0].innerHTML;
                            fieldLabel = query(".fieldLabel", currentRow)[0].value;
                            fieldType = query(".fieldSelect", currentRow)[0].value;
                            fieldDescription = query(".fieldDescription", currentRow)[0].value;
                            nullable = this.fieldInfo[layerName].Fields[Number(index) + 1].nullable;
                            domain = this.fieldInfo[layerName].Fields[Number(index) + 1].domain;
                            defaultValue = this.fieldInfo[layerName].Fields[Number(index) + 1].defaultValue;
                            sqlType = this.fieldInfo[layerName].Fields[Number(index) + 1].sqlType;
                            fieldDataType = this.fieldInfo[layerName].Fields[Number(index) + 1].type;
                            if (this.fieldInfo[layerName].Fields[Number(index) + 1].length) {
                                length = this.fieldInfo[layerName].Fields[Number(index) + 1].length;
                            }
                            else {
                                length = null;
                            }
                            _self.currentConfig.fields.push({
                                fieldName: fieldName, fieldLabel: fieldLabel,
                                fieldType: fieldType, fieldDescription: fieldDescription,
                                nullable: nullable, domain: domain,
                                defaultValue: defaultValue, sqlType: sqlType, fieldDataType: fieldDataType,
                                length: length
                            });
                        }
                    }));
                    break;
                default:
            }
        },

        //function to update the item on arcGis online
        _updateItem: function () {
            this.currentConfig.edit = "";
            lang.mixin(this.response.itemData.values, this.currentConfig);
            delete this.response.itemData.values["itemInfo"];
            this.response.item.tags = typeof (this.response.item.tags) == "object" ? this.response.item.tags.join(',') : this.response.item.tags;
            this.response.item.typeKeywords = typeof (this.response.item.typeKeywords) == "object" ? this.response.item.typeKeywords.join(',') : this.response.item.typeKeywords;
            var rqData = lang.mixin(this.response.item, {
                id: this.currentConfig.appid,
                item: this.currentConfig.appid,
                itemType: "text",
                f: 'json',
                token: this.userInfo.token,
                title: this.currentConfig.details.Title ? this.currentConfig.details.Title : "Geo Form",
                text: JSON.stringify(this.response.itemData),
                type: "Web Mapping Application",
                overwrite: true
            });
            domClass.add(document.body, "app-loading");
            arcgisUtils.getItem(this.currentConfig.appid).then(lang.hitch(this, function (response) {
                var updateURL = this.userInfo.portal.url + "/sharing/content/users/" + this.userInfo.username + (response.item.ownerFolder ? ("/" + response.item.ownerFolder) : "") + "/items/" + this.currentConfig.appid + "/update";
                esriRequest({
                    url: updateURL,
                    content: rqData,
                    handleAs: 'json'
                }, { usePost: true }).then(lang.hitch(this, function (result) {
                    if (result.success) {
                        domClass.remove(document.body, "app-loading");
                        this._ShareDialog = new ShareDialog({
                            bitlyLogin: this.currentConfig.bitlyLogin,
                            bitlyKey: this.currentConfig.bitlyKey,
                            //map: dojo.map,
                            image: this.currentConfig.sharinghost + '/sharing/rest/content/items/' + this.currentConfig.itemInfo.item.id + '/info/' + this.currentConfig.itemInfo.item.thumbnail,
                            title: this.currentConfig.details.Title || "Geoform",
                            summary: this.currentConfig.details.Description,
                            hashtags: 'esriDSM'
                        });
                        this._ShareDialog.startup();
                        $("#myModal").modal('show');
                    }
                }), function () {
                    domClass.remove(document.body, "app-loading");
                });
            }));
        },

        //function to enable the tab passed in input parameter
        _enableTab: function (currentTab) {
            if (domClass.contains(currentTab, "btn")) {
                domClass.remove(currentTab, "disabled");
            }
            else {
                domClass.remove(currentTab.parentNode, "disabled");
            }
            domAttr.set(currentTab, "data-toggle", "tab");
        },

        //function to disable the tab passed in input parameter
        _disableTab: function (currentTab) {
            if (domClass.contains(currentTab, "btn")) {
                domClass.add(currentTab, "disabled");
            }
            else {
                domClass.add(currentTab.parentNode, "disabled");
            }
            domAttr.set(currentTab, "data-toggle", "");
        },

        _getFieldCheckboxState: function () {
            array.forEach(query(".navigationTabs"), lang.hitch(this, function (currentTab) {
                if ((domAttr.get(currentTab, "tab") === "preview" || domAttr.get(currentTab, "tab") === "publish") && (query(".fieldCheckbox:checked").length === 0)) {
                    this._disableTab(currentTab);
                }
                else {
                    this._enableTab(currentTab);
                }
            }));
        }
    });
});